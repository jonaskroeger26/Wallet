export type NftPreview = {
  id: string;
  name?: string;
  image?: string;
};

/** Helius DAS-style asset list (requires API key). */
export async function fetchNftsHelius(
  address: string,
  apiKey: string
): Promise<NftPreview[]> {
  const url = `https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/nfts?api-key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map((item, i) => {
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? o.mint ?? i);
    const content = (o.content as Record<string, unknown> | undefined)?.metadata as
      | Record<string, unknown>
      | undefined;
    const name = content?.name != null ? String(content.name) : undefined;
    const files = content?.files as Array<{ uri?: string }> | undefined;
    const image =
      (content?.image as string | undefined) ?? files?.[0]?.uri ?? undefined;
    return { id, name, image };
  });
}
