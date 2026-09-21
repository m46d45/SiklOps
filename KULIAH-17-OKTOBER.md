# SiklOps — kuliah 17 Oktober

## Yang dibagikan ke mahasiswa

**https://siklops.vercel.app**

Tidak perlu akun. Mulai dari **Earthmoving**, seed **12345**.

Jangan bagikan repo Streamlit atau `streamlit run`.

## Yang harus Anda set di Vercel (sekali)

Git sudah terhubung ke `m46d45/SiklOps`. Auth biarkan mati: **jangan** set `VITE_AUTH_ENABLED`.

Parade Tim Kerja **tidak** punya Environment Variables di Vercel — jangan mencari `DATABASE_URL` di situ.

`/statistik` hanya bertahan antar-deploy jika project **siklops** punya Postgres Neon. Simulasi tetap jalan tanpa itu.

### Cara A — tetap di Vercel (paling cepat)

1. Buka project **siklops** (domain `siklops.vercel.app`), bukan `parade-tim-kerja`.
2. Sidebar kiri: **Storage** (bukan halaman Environment Variables).
3. **Create Database** → **Neon Postgres** → Create, link ke Production.
4. Vercel akan mengisi `POSTGRES_URL` (atau `DATABASE_URL`) otomatis.
5. **Deployments → Production → Redeploy**.
6. Buka https://siklops.vercel.app/statistik  
   Harus ada “Backend: Neon/Postgres”, bukan peringatan PGLite.

### Cara B — dari konsol Neon

1. Buka [console.neon.tech](https://console.neon.tech) (akun yang sama dengan database Parade, jika ada).
2. Pilih project yang sudah ada, atau **New Project**.
3. **Connection details** → URI `postgresql://…` (boleh pooled).
4. Project **siklops** → **Settings → Environment Variables → Add**.
5. Key: `DATABASE_URL`. Value: tempel URI. Environment: **Production**.
6. **Redeploy** Production.
7. Jangan kirim URI ke chat.

## Cek 5 menit sebelum kelas

- Beranda Earthmoving tampil, hasil default ada.
- Footer: disclaimer “model ajar” + privasi.
- Tab **Perbandingan**: tombol “Hitung perbandingan” (bukan langsung grafik).
- `/login` kembali ke beranda.
- `/statistik`: jika sudah set Neon, tidak ada banner PGLite kuning.
- HP/Chromebook: halaman bisa di-scroll dan tombol Jalankan berfungsi.

## Jika laptop mahasiswa terasa berat

Jangan buka tab Perbandingan atau Multi-run kecuali perlu. Satu kali “Jalankan simulasi” sudah cukup untuk diskusi match factor.
