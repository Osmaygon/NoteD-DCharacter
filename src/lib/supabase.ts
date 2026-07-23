type RpcArgs = Record<string, unknown>;
type RpcResult<T = unknown> = { data: T | null; error: { message: string } | null };

export const supabase = {
  async rpc<T = unknown>(name: string, args: RpcArgs = {}): Promise<RpcResult<T>> {
    try {
      const response = await fetch("/api/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, args }),
      });
      const body = (await response.json()) as { data?: T; error?: string };
      if (!response.ok) return { data: null, error: { message: body.error ?? "Error de base de datos" } };
      return { data: body.data ?? null, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Error de red" } };
    }
  },
};
