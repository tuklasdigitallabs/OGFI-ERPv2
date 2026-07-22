# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# Supply both images as immutable name@sha256 references. They intentionally have
# no defaults so an unpinned upstream image cannot enter the release build.
ARG CADDY_BUILDER_IMAGE
ARG CADDY_RUNTIME_IMAGE
ARG CADDY_VERSION=v2.11.4
ARG CADDY_RATELIMIT_COMMIT=5625512f24f6f59d6f64fb3aafe5eecff0b286db

FROM ${CADDY_BUILDER_IMAGE} AS builder

ARG CADDY_VERSION
ARG CADDY_RATELIMIT_COMMIT

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -eux; \
    test "${#CADDY_RATELIMIT_COMMIT}" -eq 40; \
    case "${CADDY_RATELIMIT_COMMIT}" in \
      *[!0-9a-f]*) echo "CADDY_RATELIMIT_COMMIT must be a full lowercase Git commit" >&2; exit 1 ;; \
    esac; \
    xcaddy build "${CADDY_VERSION}" \
      --with "github.com/mholt/caddy-ratelimit@${CADDY_RATELIMIT_COMMIT}" \
      --output /usr/bin/caddy; \
    setcap -r /usr/bin/caddy; \
    test -z "$(getcap /usr/bin/caddy)"; \
    /usr/bin/caddy list-modules | grep -qx 'http.handlers.rate_limit'

FROM ${CADDY_RUNTIME_IMAGE}

ARG CADDY_VERSION
ARG CADDY_RATELIMIT_COMMIT

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

LABEL io.ogfi.caddy.version="${CADDY_VERSION}" \
      io.ogfi.caddy-ratelimit.commit="${CADDY_RATELIMIT_COMMIT}" \
      io.ogfi.caddy-ratelimit.module="github.com/mholt/caddy-ratelimit"
