"use client";
export default function PrintButton() {
  return (
    <button type="button"
      onClick={() => window.print()}
      style={{
        background: "#244f73",
        color: "white",
        padding: "10px 18px",
        borderRadius: 6,
      }}
    >
      Cetak / Simpan PDF
    </button>
  );
}
