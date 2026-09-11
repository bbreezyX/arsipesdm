import { useRef } from "react";

/**
 * Key React yang stabil untuk daftar baris tanpa id, misalnya biaya tambahan atau penginapan.
 * Dengan key index, menghapus baris di tengah membuat React menempelkan state komponen baris
 * berikutnya ke baris yang salah. Panggil `remove(index)` tepat sebelum baris dibuang.
 * Baris yang ditambahkan di akhir mendapat key baru; perubahan lain dari luar diselaraskan menurut panjang.
 */
export function useRowKeys(count: number) {
  const keys = useRef<number[]>([]);
  const next = useRef(0);
  while (keys.current.length < count) keys.current.push(next.current++);
  if (keys.current.length > count) keys.current.length = count;
  return {
    keys: keys.current,
    remove(index: number) {
      keys.current.splice(index, 1);
    },
  };
}
