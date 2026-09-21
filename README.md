# SiklOps

**SiklOps** — *Simulation of Cyclic Construction Operations*

Satu produk: aplikasi web di **Vercel**.

→ **https://siklops.vercel.app**

Edisi Streamlit Python sudah **retired** (tidak dipakai kuliah).

## Kuliah 17 Oktober

Mahasiswa hanya membuka URL di atas. Tidak perlu akun, tidak perlu Streamlit.

Dosen: lihat [`KULIAH-17-OKTOBER.md`](./KULIAH-17-OKTOBER.md).

## Operasi (sederhana → kompleks)

1. Earthmoving — excavator + dump truck  
2. Bricklaying — helper + tukang + buffer  
3. Concreting / RMC — truck mixer + placing (buggy / crane / pump)  
4. Tower crane — banyak front, 1 server, prioritas  
5. Asphalt paving — plant + truck + paver + roller  
6. Precast plant — form + crew + crane + cure slots  

Ini **model ajar**, bukan spesifikasi lapangan.

## Lokal

```bash
npm install
npm run dev      # http://localhost:8080
npm run build
npm run typecheck
```

Node **22+**.

## Vercel

Project Git harus mengarah ke repo **ini** (`m46d45/SiklOps`), bukan `SiklOps-web`.

Environment:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | Ya, untuk `/statistik` | Neon yang sama dengan Parade Tim Kerja boleh |
| `VITE_AUTH_ENABLED` | Jangan diisi | Login tetap mati |

Build: `npm run build` · Node 22.

## Lisensi

Educational use (kuliah / pelatihan).
