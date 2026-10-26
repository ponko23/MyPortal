namespace MyPortal.BookMemo.Models;

public sealed record BookState
{
    public required BookMetadataDto Metadata { get; init; }

    public required ReadingRecordDto ReadingRecord { get; init; }

    public OwnershipStatus OwnershipStatus => BookDataRules.GetOwnershipStatus(ReadingRecord);
}
