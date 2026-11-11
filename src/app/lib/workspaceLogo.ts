const workspaceLogos: ReadonlyMap<string, string> = new Map([
  ["rnl-creations", "/Brand/rnl-multi-colors.png"],
]);

export function workspaceLogo(slug: string) {
  return workspaceLogos.get(slug);
}
