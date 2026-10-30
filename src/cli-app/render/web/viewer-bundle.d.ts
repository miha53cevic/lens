// The viewer bundled ahead of time: a module only the compiled `lens` has (see bundle.ts).
declare module 'lens:viewer-bundle' {
  const bundle: import('./bundle.ts').ViewerBundle;
  export default bundle;
}
