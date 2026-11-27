// A file imported `with { type: 'text' }` (CHANGELOG.md): Bun gives its text, and bundles it into the app.
declare module '*.md' {
  const text: string;
  export default text;
}
