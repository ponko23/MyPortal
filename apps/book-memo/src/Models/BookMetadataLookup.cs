namespace MyPortal.BookMemo.Models;

public static class BookMetadataLookup
{
    public static BookMetadataDto Apply(
        BookMetadataDto current,
        BookMetadataLookupResult result)
    {
        ArgumentNullException.ThrowIfNull(current);
        ArgumentNullException.ThrowIfNull(result);
        ArgumentException.ThrowIfNullOrWhiteSpace(result.Isbn);

        if (HasSameIsbn(current.Isbn, result.Isbn))
        {
            return current with
            {
                Isbn = result.Isbn,
                Title = HasText(result.Title) ? result.Title! : current.Title,
                Authors = result.Authors is { Count: > 0 } ? result.Authors : current.Authors,
                Publisher = HasText(result.Publisher) ? result.Publisher : current.Publisher,
                PublishedOn = result.PublishedOn ?? current.PublishedOn,
                CoverImageUrl = HasText(result.CoverImageUrl) ? result.CoverImageUrl : current.CoverImageUrl,
                Description = HasText(result.Description) ? result.Description : current.Description,
            };
        }

        return new BookMetadataDto
        {
            Id = current.Id,
            Isbn = result.Isbn,
            Title = result.Title ?? string.Empty,
            Authors = result.Authors ?? [],
            Publisher = result.Publisher,
            PublishedOn = result.PublishedOn,
            CoverImageUrl = result.CoverImageUrl,
            Description = result.Description,
        };
    }

    private static bool HasSameIsbn(string? currentIsbn, string lookupIsbn)
    {
        return currentIsbn is not null &&
            NormalizeIsbn(currentIsbn).Equals(NormalizeIsbn(lookupIsbn), StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeIsbn(string isbn)
    {
        return string.Concat(isbn.Where(character => !char.IsWhiteSpace(character) && character != '-'));
    }

    private static bool HasText(string? value)
    {
        return !string.IsNullOrWhiteSpace(value);
    }
}
