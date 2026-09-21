import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6">
        <p>
          <strong className="font-medium text-foreground">Model ajar, bukan desain lapangan.</strong>{" "}
          Throughput, biaya satuan, emisi solar, match factor, dan rumus antrian
          (Little / Kingman) adalah model pendidikan dengan asumsi yang disederhanakan.
          Jangan dipakai sebagai spesifikasi proyek tanpa kalibrasi data lapangan.
        </p>
        <p>
          <strong className="font-medium text-foreground">Privasi.</strong> Simulasi
          berjalan di browser Anda. Tidak perlu akun. Aplikasi menyimpan ID acak di
          peramban dan mengirim hitungan kunjungan/simulasi (tanpa nama, email, atau
          nilai tugas) agar dosen melihat agregat di{" "}
          <Link to="/statistik" className="underline underline-offset-2">
            /statistik
          </Link>
          . Hapus data situs di browser untuk mereset ID perangkat.
        </p>
        <p className="text-[11px]">
          SiklOps · Discrete-event simulation · Pembelajaran operasi konstruksi
        </p>
      </div>
    </footer>
  );
}
