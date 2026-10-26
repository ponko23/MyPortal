using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// ここに配信したい SPA を列挙します。Physical は各アプリの "wwwroot" への相対パスです。
var mappings = new[]
{
    new { UrlPath = "/book-memo", Physical = Path.Combine(builder.Environment.ContentRootPath, "../book-memo/src/wwwroot") },
    new { UrlPath = "/home-stock", Physical = Path.Combine(builder.Environment.ContentRootPath, "../home-stock/src/wwwroot") },
    // 必要に応じて他のアプリを追加してください。
};

foreach (var m in mappings)
{
    var physical = m.Physical;
    var urlPath = m.UrlPath;

    app.Map(urlPath, spaApp =>
    {
        // PathBase を設定して、SPA 側が URL を相対解決する際に期待通りになるようにする
        spaApp.Use(async (ctx, next) =>
        {
            ctx.Request.PathBase = new PathString(urlPath);
            await next();
        });

        // 静的ファイルを物理フォルダから配信
        spaApp.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(physical),
            RequestPath = PathString.Empty
        });

        // SPA フォールバック：存在しないパスは index.html を返す
        spaApp.Run(async ctx =>
        {
            ctx.Response.ContentType = "text/html";
            await ctx.Response.SendFileAsync(Path.Combine(physical, "index.html"));
        });
    });
}

app.Run();
