# Purchase Orders: bounded recommendation lookup

Purchase Order creation now searches approved supplier recommendations in pages instead of loading the full queue. Search by PR reference, supplier, or quote reference, with clear empty, loading, retry, and paging states. Existing approval, scope, and duplicate-PO checks remain enforced when the draft is created.
