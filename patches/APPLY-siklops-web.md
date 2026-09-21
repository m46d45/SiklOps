# Terapkan penguatan kuliah masal ke SiklOps-web

Agen ini terikat ke repo Streamlit `m46d45/SiklOps` dan **tidak bisa push** ke `m46d45/SiklOps-web`. Perubahan sudah dibuat dan diuji di clone lokal.

## Cara merakit ke SiklOps-web

```bash
git clone https://github.com/m46d45/SiklOps-web.git
cd SiklOps-web
git checkout -b cursor/classroom-hardening-4c4e
git apply patches/siklops-web-classroom-hardening.patch
# atau, dari repo ini:
# git apply /path/to/SiklOps/patches/siklops-web-classroom-hardening.patch
```

Patch ada di `patches/siklops-web-classroom-hardening.patch` (repo ini).

## Vercel (project SiklOps-web, bukan Parade Tim Kerja)

`DATABASE_URL` Parade Tim Kerja **tidak otomatis** masuk ke project Vercel SiklOps-web. Tambahkan env yang sama di project **SiklOps-web**, lalu redeploy.

Jangan set `VITE_AUTH_ENABLED` (login tetap mati).
