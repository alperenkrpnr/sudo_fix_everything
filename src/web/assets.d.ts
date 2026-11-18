// Vite statik dosya içe aktarımları (URL döner).
declare module '*.png' {
  const url: string;
  export default url;
}
