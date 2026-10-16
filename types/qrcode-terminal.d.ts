declare module "qrcode-terminal" {
  export function generate(text: string, opts?: { small?: boolean }): void;
  const _default: { generate: typeof generate };
  export default _default;
}
