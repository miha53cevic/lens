// A .wasm file imported `with { type: "file" }`: Bun gives its path, which the compiled `lens`
// carries inside it (see parser.ts).
declare module '*.wasm' {
  const path: string;
  export default path;
}
