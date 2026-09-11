/** Dipanggil Next sekali saat server mulai, sebelum request pertama dilayani. Kode khusus Node dipisah agar bundel Edge tidak ikut membawanya. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { register: registerNode } = await import("./instrumentation-node");
  registerNode();
}
