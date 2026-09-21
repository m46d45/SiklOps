# SiklOps — kuliah 17 Oktober

## Yang dibagikan ke mahasiswa

**https://siklops.vercel.app**

Tidak perlu akun. Mulai dari **Earthmoving**, seed **12345**.

Jangan bagikan repo Streamlit atau `streamlit run`.

## Yang harus Anda set di Vercel (sekali)

1. Buka [vercel.com](https://vercel.com) → project yang memakai domain `siklops.vercel.app`.
2. **Settings → Git**: connected repo = **`m46d45/SiklOps`** (bukan `SiklOps-web`).
3. **Settings → Environment Variables**:
   - `DATABASE_URL` = connection string Neon (boleh sama dengan Parade Tim Kerja).
   - Jangan set `VITE_AUTH_ENABLED`.
4. **Redeploy**.
5. Buka https://siklops.vercel.app/statistik  
   Harus ada tulisan backend Neon/Postgres, bukan peringatan PGLite.

## Cek 5 menit sebelum kelas

- Beranda Earthmoving tampil, hasil default ada.
- Footer: disclaimer “model ajar” + privasi.
- Tab **Perbandingan**: tombol “Hitung perbandingan” (bukan langsung grafik).
- `/login` kembali ke beranda.
- HP/Chromebook: halaman bisa di-scroll dan tombol Jalankan berfungsi.

## Jika laptop mahasiswa terasa berat

Jangan buka tab Perbandingan atau Multi-run kecuali perlu. Satu kali “Jalankan simulasi” sudah cukup untuk diskusi match factor.
