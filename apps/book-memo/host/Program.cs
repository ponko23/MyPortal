using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Serve static files from the BookMemo wwwroot (relative to this host project folder)
builder.WebHost.UseWebRoot(Path.Combine(builder.Environment.ContentRootPath, "../src/wwwroot"));

var app = builder.Build();

// Host under the sub-path /book-memo
app.UsePathBase("/book-memo");

// Enable static files (will be served under /book-memo/)
app.UseStaticFiles();

app.UseRouting();

// Fallback all non-file requests to index.html (for SPA routing)
app.MapFallbackToFile("index.html");

app.Run();
