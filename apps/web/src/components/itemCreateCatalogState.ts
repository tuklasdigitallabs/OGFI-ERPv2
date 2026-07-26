export type ItemCatalogOption = {
  id: string;
  code: string;
  label: string;
  status: string;
};

export type ItemCatalogRequest = {
  kind: "item" | "category" | "uom";
  query: string;
  page: number;
  pageSize: number;
  selectedId: string;
  signal: AbortSignal;
};

export type ItemCatalogResponse = {
  options: ItemCatalogOption[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type AcceptedItemCatalog = ItemCatalogResponse & {
  pages: number;
};

export type ItemCatalogFetcher = (
  request: ItemCatalogRequest
) => Promise<ItemCatalogResponse>;

export class ItemCatalogRequestError extends Error {
  constructor(
    readonly code: "OPTION_LOOKUP_RATE_LIMITED" | "OPTION_LOOKUP_UNAVAILABLE",
    readonly retryAfterSeconds: number | null = null
  ) {
    super(code);
    this.name = "ItemCatalogRequestError";
  }
}

function parseRetryAfterSeconds(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 60 ? parsed : 2;
}

export function catalogSelectionReady(input: {
  required: boolean;
  selectedId: string;
  options: ItemCatalogOption[];
  loading: boolean;
  debouncing: boolean;
  error: string | null;
}) {
  if (!input.required && !input.selectedId) return true;
  return Boolean(
    input.selectedId &&
    !input.loading &&
    !input.debouncing &&
    !input.error &&
    input.options.some(
      (option) => option.id === input.selectedId && option.status === "ACTIVE"
    )
  );
}

export function createItemCatalogRequestController(fetchCatalog: ItemCatalogFetcher) {
  let requestSequence = 0;
  let activeController: AbortController | null = null;

  return {
    abort() {
      requestSequence += 1;
      activeController?.abort();
      activeController = null;
    },

    async load(
      request: Omit<ItemCatalogRequest, "signal">,
      accept: (result: AcceptedItemCatalog) => void
    ) {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const sequence = ++requestSequence;

      try {
        const result = await fetchCatalog({ ...request, signal: controller.signal });
        if (controller.signal.aborted || sequence !== requestSequence) {
          return { accepted: false, aborted: true } as const;
        }

        const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
        const accepted = {
          ...result,
          page: Math.min(Math.max(1, result.page), pages),
          pages
        };
        accept(accepted);
        return { accepted: true, aborted: false } as const;
      } catch (error) {
        if (
          controller.signal.aborted ||
          sequence !== requestSequence ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return { accepted: false, aborted: true } as const;
        }
        throw error;
      }
    }
  };
}

export const fetchItemMasterCatalog: ItemCatalogFetcher = async (request) => {
  const search = new URLSearchParams({
    kind: request.kind,
    query: request.query,
    page: String(request.page),
    pageSize: String(request.pageSize)
  });
  if (request.selectedId) search.append("selectedId", request.selectedId);
  const response = await fetch(`/api/items/option-catalog?${search.toString()}`, {
    cache: "no-store",
    signal: request.signal
  });
  if (!response.ok) {
    if (response.status === 429) {
      throw new ItemCatalogRequestError(
        "OPTION_LOOKUP_RATE_LIMITED",
        parseRetryAfterSeconds(response.headers.get("Retry-After"))
      );
    }
    throw new ItemCatalogRequestError("OPTION_LOOKUP_UNAVAILABLE");
  }
  return response.json() as Promise<ItemCatalogResponse>;
};
