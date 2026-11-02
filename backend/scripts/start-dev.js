if (process.env.NODE_ENV === undefined) {
    process.env.NODE_ENV = "development";
}

await import("../src/server.js");
