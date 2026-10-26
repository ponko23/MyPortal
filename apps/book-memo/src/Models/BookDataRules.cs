namespace MyPortal.BookMemo.Models;

public static class BookDataRules
{
    public static OwnershipStatus GetOwnershipStatus(ReadingRecordDto record)
    {
        ArgumentNullException.ThrowIfNull(record);

        return (record.BorrowedOn.HasValue, record.PurchasedOn.HasValue) switch
        {
            (false, false) => OwnershipStatus.NotOwned,
            (true, false) => OwnershipStatus.BorrowedNotPurchased,
            (false, true) => OwnershipStatus.Purchased,
            (true, true) => OwnershipStatus.BorrowedThenPurchased,
        };
    }

    public static IReadOnlyList<string> ValidateMetadata(BookMetadataDto metadata)
    {
        ArgumentNullException.ThrowIfNull(metadata);

        var errors = new List<string>();
        if (metadata.Id == Guid.Empty)
        {
            errors.Add("書誌情報のIDは必須です。");
        }

        if (string.IsNullOrWhiteSpace(metadata.Title))
        {
            errors.Add("本のタイトルは必須です。");
        }

        return errors;
    }

    public static IReadOnlyList<string> ValidateReadingRecord(ReadingRecordDto record)
    {
        ArgumentNullException.ThrowIfNull(record);

        var errors = new List<string>();
        if (record.Id == Guid.Empty)
        {
            errors.Add("読書記録のIDは必須です。");
        }

        if (record.BookMetadataId == Guid.Empty)
        {
            errors.Add("関連する書誌情報は必須です。");
        }

        if (record.RegisteredOn == default)
        {
            errors.Add("登録日は必須です。");
        }

        if (record.BorrowedOn == DateOnly.MinValue)
        {
            errors.Add("借用日は有効な日付を指定してください。");
        }

        if (record.PurchasedOn == DateOnly.MinValue)
        {
            errors.Add("購入日は有効な日付を指定してください。");
        }

        if (record.BorrowedOn.HasValue &&
            record.PurchasedOn.HasValue &&
            record.BorrowedOn > record.PurchasedOn)
        {
            errors.Add("借用日は購入日より後の日付にできません。");
        }

        if (record.ReadOn == DateOnly.MinValue)
        {
            errors.Add("読了日は有効な日付を指定してください。");
        }

        if (!Enum.IsDefined(record.ReadingStatus))
        {
            errors.Add("読書状態が正しくありません。");
        }

        return errors;
    }

    public static IReadOnlyList<string> ValidateInitialRegistration(
        BookRegistrationType registrationType,
        DateOnly registeredOn,
        DateOnly? borrowedOn,
        DateOnly? purchasedOn)
    {
        var errors = new List<string>();
        switch (registrationType)
        {
            case BookRegistrationType.Candidate:
                if (borrowedOn.HasValue || purchasedOn.HasValue)
                {
                    errors.Add("購入候補として登録する場合、借用日と購入日は未入力にしてください。");
                }
                break;
            case BookRegistrationType.Borrowed:
                if (!borrowedOn.HasValue)
                {
                    errors.Add("借用として登録する場合、借用日は必須です。");
                }

                if (purchasedOn.HasValue)
                {
                    errors.Add("借用として登録する場合、購入日は未入力にしてください。");
                }
                break;
            case BookRegistrationType.Purchased:
                if (!purchasedOn.HasValue)
                {
                    errors.Add("購入として登録する場合、購入日は必須です。");
                }
                break;
            default:
                errors.Add("登録方法が正しくありません。");
                break;
        }

        if (registeredOn == default)
        {
            errors.Add("登録日は必須です。");
        }

        if (borrowedOn == DateOnly.MinValue)
        {
            errors.Add("借用日は有効な日付を指定してください。");
        }

        if (purchasedOn == DateOnly.MinValue)
        {
            errors.Add("購入日は有効な日付を指定してください。");
        }

        if (borrowedOn.HasValue &&
            purchasedOn.HasValue &&
            borrowedOn > purchasedOn)
        {
            errors.Add("借用日は購入日より後の日付にできません。");
        }

        return errors;
    }

    public static BookState CreateState(BookMetadataDto metadata, ReadingRecordDto record)
    {
        ArgumentNullException.ThrowIfNull(metadata);
        ArgumentNullException.ThrowIfNull(record);

        var errors = ValidateMetadata(metadata)
            .Concat(ValidateReadingRecord(record))
            .ToList();

        if (metadata.Id != record.BookMetadataId)
        {
            errors.Add("読書記録が参照する書誌情報と指定された書誌情報が一致しません。");
        }

        if (errors.Count > 0)
        {
            throw new ArgumentException(string.Join(Environment.NewLine, errors));
        }

        return new BookState
        {
            Metadata = metadata,
            ReadingRecord = record,
        };
    }
}
