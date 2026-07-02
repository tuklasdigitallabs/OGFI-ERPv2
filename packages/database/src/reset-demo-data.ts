if (process.env.NODE_ENV === "production") {
  throw new Error("DEMO_RESET_REFUSES_PRODUCTION_ENVIRONMENT");
}

process.env.DEMO_RESET_DATA = "true";

await import("./seed");

export {};
