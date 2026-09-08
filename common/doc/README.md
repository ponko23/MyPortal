# 共通基盤 - ドキュメント

## 共通基盤の目的

共通基盤は、MyPortal の複数のアプリから利用する再利用可能な機能とロジックを集約したものです。

各アプリが独立しながらも、共通の機能を効率的に利用できる基盤を提供することが目的です。

## 共通基盤の責務

共通基盤には、少なくとも以下のような機能を含める可能性があります。

- **UI コンポーネント**: 複数アプリで共有される UI 部品
- **テーマ**: デザイン・スタイル管理
- **State / Store**: アプリケーション状態管理とビジネスロジック
- **Validation**: 入力値検証（UI フレームワーク非依存）
- **Repository / Storage**: データアクセスと永続化層の抽象化
- **ローカルストレージ**: SQLite / OPFS へのアクセス
- **その他**: アプリ間で共通化可能なアプリケーションロジック

### 責務に関する重要な原則
- **先行実装の回避**: 現時点で必要性が確認されていない機能まで先行して実装・抽象化しないこと

## 設計上の基本方針

### 機能単位での分離

共通基盤は機能単位で分離することを基本方針とします。

```
common/
└─ src/
   ├─ Components/          # UI コンポーネント
   ├─ State/               # State 定義・Store 基盤
   ├─ Validation/          # Validation ロジック
   ├─ Repository/          # Repository 抽象化
   ├─ Storage/             # Storage 実装・Factory
   └─ ...
```

（実際の構成は、発展に伴って定義されます）

### 複数の DLL への分割

共通基盤の機能は必要に応じて複数の DLL として分割します。

各アプリが共通基盤の全機能を参照することを前提とせず、必要な機能だけを依存関係に追加できる構成を目指します。

**例**:
- `MyPortal.Common.Components` - UI コンポーネント
- `MyPortal.Common.State` - State / Store 管理
- `MyPortal.Common.Persistence` - Repository / Storage
- など

### UI とアプリケーションロジックの分離

共通基盤では、UI フレームワーク非依存なロジックと UI 固有の実装を明確に分離します。

アプリケーションレイヤー全体における分離方針は `doc/README.md` の「アーキテクチャ設計方針」を参照してください。

共通基盤で提供する主要なパターン：

- **State**: UI フレームワーク非依存な状態定義
- **Store**: UI フレームワーク非依存なビジネスロジック・State 管理
- **Repository**: UI フレームワーク非依存なデータアクセス抽象化
- **Storage**: UI フレームワーク非依存な永続化手段の実装
- **ViewModel / UI Component**: Blazor など特定の UI フレームワークに依存した実装

## State と Dto の命名規則

全プロジェクト共通ルール：

- **State** = UI / アプリケーション側で扱う状態
  - 永続化形式を意識しない
  - クラス名の末尾は `State` で命名
  - 例: `SettingsState`、`UserState`

- **Dto** = Repository / Storage 側で永続化・取得するデータ
  - データベーステーブル・ファイル構造に対応
  - UI フレームワークに依存しない
  - クラス名の末尾は `Dto` で命名
  - 例: `UserSettingDto`、`ThemeSettingDto`

Store が必要に応じて State と Dto を変換・構成・分解します。

**例**:
```
SettingsState
  ↓
SettingsStore
  ├─ IRepository<UserSettingDto>
  ├─ IRepository<ThemeSettingDto>
  └─ IRepository<DisplaySettingDto>
```

この例では、SettingsStore が 3 つの Dto から 1 つの SettingsState を構成します。

## Repository と Storage の設計方針

### Repository の役割

Repository は Dto を単位としたデータアクセスを抽象化します。

```csharp
interface IRepository<TDto>
{
    Task<TDto> GetByKey(...);
    Task<IEnumerable<TDto>> Get(condition, offset?, limit?, order?);
    Task<int> Count(condition);
}
```

Repository は以下を担当します：

- Dto 単位での取得・検索
- 条件指定・ページング範囲（offset / limit）
- 件数取得
- 明示的な並び順（Order）指定

Repository は以下を**担当しない**：

- Paging・Infinite Scroll などの UI 上の利用方法
- 具体的な Storage 実装の生成（StorageFactory を利用）

**重要な設計原則**:

Repository の分割は「利用する画面の都合」ではなく、「扱うデータ / データソースの性質」を基準とします。

例: 同じ画面で複数の異なるデータソースを利用する場合は、複数の Repository を使い分けます。

### Storage の役割

Storage は Repository から見た実際の保存・取得手段を抽象化します。

```csharp
interface IStorage<TDto>
{
    Task<TDto> GetByKey(...);
    Task<IEnumerable<TDto>> Get(condition, offset?, limit?, order?);
    Task<int> Count(condition);
    Task Save(TDto data);
    Task Delete(...);
}
```

具体的な Storage 実装の例：

- `SQLiteOnOPFSStorage<TDto>` - SQLite on OPFS
- `FileStorage<TDto>` - ファイルベース
- `RemoteStorage<TDto>` - Web API ベース
- など

### StorageFactory の役割

具体的な Storage 実装の生成は StorageFactory に集約します。

```csharp
interface IStorageFactory
{
    IStorage<TDto> Create<TDto>(StorageConfig config);
}
```

Store は以下のように StorageFactory を利用します：

```
Store
  ↓
StorageFactory.Create<TDto>(...)
  ↓
Repository (IStorage<TDto> を利用)
  ↓
Concrete Storage Implementation
```

**重要な原則**:

- Store が具体的な Storage クラス（`new SQLiteOnOPFSStorage<TDto>()`）を直接生成しない
- Repository も同様に StorageFactory を経由して Storage インスタンスを取得
- DIコンテナは必須とせず、依存関係を明示できる Factory + コンストラクタ注入を基本とする

## Store の設計方針

### Store の責務

Store はアプリケーション機能単位での境界です：

- **State 管理**: UI / アプリケーションが必要とする状態を保持・提供
- **Action 処理**: UI からの操作を受け取り、State を更新
- **Store Validation**: State 更新時にビジネスルール・ドメインルールをチェック
- **Dto ↔ State 変換**: 複数の Dto から State を構成、State から複数の Dto へ分解
- **Repository 組み立て**: 必要な Repository を生成・保有・管理

### 複数 Repository の利用

Store は複数の Repository を内部に保有し、組み合わせて利用できます。

```csharp
class SettingsStore
{
    private readonly IRepository<UserSettingDto> userSettingRepo;
    private readonly IRepository<ThemeSettingDto> themeSettingRepo;
    private readonly IRepository<DisplaySettingDto> displaySettingRepo;

    // SettingsState を提供
    public SettingsState CurrentState { get; }
}
```

同一の Dto 型を複数の Repository から取得することも許容します。
重要なのは、Repository の分割基準が「データ・データソースの性質」であることです。

### Read / Write の責務分離

Store が複数の Repository を持つため、単純な `IReadStore<T>` / `IWriteStore<T>` に限定できません。

代わりに、Store の公開インターフェースで Read / Write 能力を制御します：

```csharp
// 読み取り専用の Store
interface IReadSettingsStore
{
    SettingsState GetCurrentState();
}

// 書き込み可能な Store
interface IWriteSettingsStore : IReadSettingsStore
{
    Task UpdateUserSettingAsync(UserSettingDto setting);
    Task UpdateThemeAsync(ThemeSettingDto theme);
}
```

内部では複数の Repository を持ちながら、公開インターフェースで能力を制限することで、
利用側（UI / アプリケーション）に対して適切な権限を与えます。

## Validation の設計方針

### 3層の Validation

アプリケーション全体で 3 つの層の Validation が存在します。詳細は `doc/README.md` の「Validation の3層分離」を参照してください。

共通基盤で提供するのは以下の層です：

#### 1. Store Validation（ビジネスロジック層）

State 更新時にビジネスルール・ドメインルールをチェックします。

```csharp
class SettingsStore
{
    public async Task UpdateUserSettingAsync(string key, string value)
    {
        // Validation: ビジネスルール確認
        if (!IsValidKey(key))
            throw new ValidationException("Invalid key");

        if (!IsValidValue(key, value))
            throw new ValidationException("Invalid value for this key");

        // State を更新
        // Repository へ保存
    }
}
```

- UI フレームワーク非依存
- 複数の Validation ルールを組み合わせられる設計
- 失敗時は例外またはエラー結果を返す

#### 2. Storage/Repository Validation（永続化層）

Dto がスキーマ要件を満たしているか、Storage 制約を満たしているかチェックします。

Repository が Storage へ永続化する前に実行されます。

制約違反は例外として Store へ報告されます。

#### 3. UI Validation（UI層）

Blazor など特定の UI フレームワークに依存した実装です。
共通基盤では提供しません。各アプリが UI 層で実装します。

### Store Validation と Storage Validation の関係

**重要な設計原則**:

Store Validation で通ったデータが Storage 制約違反で通らない場合は、
**設計のミス**（Store が把握していないルールが Storage にある）です。

このような場合：
- UI・Store・Repository のどれが「悪い」わけではない
- Store が受け取った例外をエラーハンドリングとして UI へ通知する（Validation ではない）
- 設計全体の見直しが必要

## データ永続化の設計方針

### 抽象化層の重要性

UI やアプリケーションロジックから永続化方式を直接参照しない構造を目指します。

これにより、将来的にローカル保存から Google Drive バックアップなどへの拡張が容易になります。

### 初期段階の永続化構成

```
SQLite
  ↓
OPFS
```

この構成で初期実装を行います。

Repository・Storage インターフェースを明確にすることで、
将来的に他の永続化手段へ切り替えることが可能です。

### データ分離ポリシー

- アプリごとにデータを分離することを基本
- 必要に応じて共通設定などを共有する余地を残す

## 設計上の基本原則（共通基盤開発時）

共通基盤機能を追加・更新する際は、以下の原則を参考にしてください：

### 共通化の判断

- **再利用可能性**: 複数のアプリで本当に利用する可能性があるか
- **責務の明確性**: UI フレームワーク非依存な部分と依存する部分が適切に分離できるか
- **抽象化の妥当性**: 実装後に実装の詳細が隠蔽され、複数の実装パターンに対応できるか

### 機能追加のスコープ

- **共通基盤は必要最小限にする**: 現時点で必要性が確認されていない機能まで先行実装しない
- **利用側の都合だけで増やさない**: 「この画面で必要」という理由だけで Repository や Storage を追加しない
- **データの性質を基準にする**: Repository は「データ・データソースの性質」で分割する

### 依存関係の明示

- DIコンテナは必須とせず、Factory + コンストラクタ注入で依存関係を明示する
- Store が自身の Repository・Storage を管理し、App の最上位で全てを集約しない

## 共通基盤の利用ガイドライン

### 各アプリが依存する方針

各アプリは、共通基盤から必要な機能だけを参照することを基本とします。

```
appA
  ├─ common.Components
  └─ common.Persistence
     
appB
  ├─ common.Components
  ├─ common.State
  └─ common.Validation
```

このように、アプリごとに異なる依存構成が可能です。

### 将来への拡張余地

以下の機能は現時点の初期実装対象には含めません。ただし、設計時には将来的な拡張を阻害しないよう配慮します。

- Google Drive によるバックアップ
- 複数ユーザー間でのデータ共有
- 認証機能
- バックエンドでのデータ永続化
- Cloudflare などのバックエンド機能
