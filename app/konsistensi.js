const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (pesan) => console.log(`[${new Date().toLocaleTimeString()}] ${pesan}`);

app.get('/', (req, res) => {
  res.json({
    praktikum: 'Konsistensi & Sinkronisasi Data',
    endpoint: {
      demo1_sync_vs_async: ['GET /sync', 'POST /async/proses', 'GET /async/status/:id'],
      demo2_inkonsistensi: ['GET /stok', 'POST /stok/reset', 'POST /beli/tidak-aman', 'POST /beli/aman', 'POST /simulasi/beli?mode=tidak-aman|aman&jumlah=15'],
      demo3_replikasi: ['GET /replikasi/status', 'POST /replikasi/update', 'POST /replikasi/reset'],
      demo4_update_sinkronisasi: ['GET /data', 'PUT /data/tidak-aman', 'PUT /data/aman', 'GET /data/sinkron?versi=1', 'POST /data/reset'],
    },
  });
});

/* ============================================================
   DEMO 1: SYNCHRONOUS vs ASYNCHRONOUS
   ============================================================ */

// Synchronous: klien MENUNGGU sampai proses selesai
app.get('/sync', async (req, res) => {
  const mulai = Date.now();
  log('SYNC  : request diterima, mulai proses 3 detik...');
  await wait(3000);
  log('SYNC  : proses selesai, kirim respons');
  res.json({ mode: 'synchronous', pesan: 'Klien menunggu sampai proses selesai', durasi_ms: Date.now() - mulai });
});

// Asynchronous: langsung balas 202, proses jalan di background
const jobs = {};
let jobCounter = 0;

app.post('/async/proses', (req, res) => {
  const id = String(++jobCounter);
  jobs[id] = { status: 'diproses', dibuat: new Date().toISOString() };
  log(`ASYNC : job ${id} diterima, langsung balas 202`);
  res.status(202).json({ mode: 'asynchronous', pesan: 'Request diterima, proses jalan di background', id, cek_status: `/async/status/${id}` });
  wait(3000).then(() => {
    jobs[id] = { status: 'selesai', hasil: 'Proses background selesai', selesai: new Date().toISOString() };
    log(`ASYNC : job ${id} selesai di background`);
  });
});

app.get('/async/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ pesan: 'Job tidak ditemukan' });
  res.json({ id: req.params.id, ...job });
});

/* ============================================================
   DEMO 2: KETIDAKKONSISTENAN (RACE CONDITION) & SINKRONISASI
   ============================================================ */
const STOK_AWAL = 10;
let stok = STOK_AWAL;

// Mutex sederhana: memastikan proses masuk satu per satu (antri)
class Mutex {
  constructor() { this.antrian = Promise.resolve(); }
  jalankan(fn) {
    const hasil = this.antrian.then(fn);
    this.antrian = hasil.catch(() => {});
    return hasil;
  }
}
const mutex = new Mutex();

// TIDAK AMAN: baca -> tunggu -> tulis, tanpa kunci
async function beliTidakAman(pembeli) {
  const stokDibaca = stok;
  if (stokDibaca <= 0) return { pembeli, berhasil: false, alasan: 'stok habis', stok_setelah: stok };
  await wait(100); // simulasi delay proses (cek pembayaran, akses DB, dll)
  stok = stokDibaca - 1;
  log(`TIDAK AMAN: ${pembeli} baca stok=${stokDibaca}, tulis stok=${stok}`);
  return { pembeli, berhasil: true, stok_dibaca: stokDibaca, stok_setelah: stok };
}

// AMAN: dibungkus mutex, sehingga diproses satu per satu
function beliAman(pembeli) {
  return mutex.jalankan(async () => {
    const stokDibaca = stok;
    if (stokDibaca <= 0) return { pembeli, berhasil: false, alasan: 'stok habis', stok_setelah: stok };
    await wait(100);
    stok = stokDibaca - 1;
    log(`AMAN      : ${pembeli} baca stok=${stokDibaca}, tulis stok=${stok}`);
    return { pembeli, berhasil: true, stok_dibaca: stokDibaca, stok_setelah: stok };
  });
}

app.get('/stok', (req, res) => res.json({ stok }));
app.post('/stok/reset', (req, res) => { stok = STOK_AWAL; res.json({ pesan: 'Stok di-reset', stok }); });
app.post('/beli/tidak-aman', async (req, res) => res.json(await beliTidakAman(req.body?.pembeli || 'anonim')));
app.post('/beli/aman', async (req, res) => res.json(await beliAman(req.body?.pembeli || 'anonim')));

// Simulasi banyak pembeli SERENTAK dalam 1 klik di Postman
app.post('/simulasi/beli', async (req, res) => {
  const mode = req.query.mode;
  const jumlah = parseInt(req.query.jumlah, 10) || 15;
  if (!['tidak-aman', 'aman'].includes(mode)) {
    return res.status(400).json({ pesan: "Gunakan ?mode=tidak-aman atau ?mode=aman" });
  }
  stok = STOK_AWAL;
  const fungsi = mode === 'aman' ? beliAman : beliTidakAman;
  const hasil = await Promise.all(Array.from({ length: jumlah }, (_, i) => fungsi(`pembeli-${i + 1}`)));
  const berhasil = hasil.filter((h) => h.berhasil).length;
  const stokSeharusnya = Math.max(0, STOK_AWAL - jumlah);
  res.json({
    mode, stok_awal: STOK_AWAL, jumlah_request_bersamaan: jumlah,
    transaksi_berhasil: berhasil, transaksi_gagal: jumlah - berhasil,
    stok_akhir: stok, stok_seharusnya: stokSeharusnya,
    konsisten: stok === stokSeharusnya && berhasil <= STOK_AWAL,
    detail: hasil,
  });
});

/* ============================================================
   DEMO 3: REPLIKASI DATA (PRIMARY -> REPLICA)
   ============================================================ */
const REPLIKA_DELAY = 5000; // replikasi butuh 5 detik (simulasi jaringan lambat)
const dataAwal = () => ({ nilai: 'v0', versi: 0 });
let primary = dataAwal();
let replica = dataAwal();

app.post('/replikasi/update', async (req, res) => {
  const nilai = req.body?.nilai || 'data-baru';
  const mode = req.body?.mode === 'sync' ? 'sync' : 'async';
  primary = { nilai, versi: primary.versi + 1 };
  const salinan = { ...primary };
  log(`REPLIKASI (${mode}): primary diupdate -> ${JSON.stringify(primary)}`);

  if (mode === 'sync') {
    // Tunggu replica benar-benar sama, baru balas klien
    await wait(REPLIKA_DELAY);
    replica = salinan;
    log('REPLIKASI (sync): replica sudah sama, baru balas ke klien');
    return res.json({ mode, pesan: 'Primary & replica sudah konsisten sebelum respons dikirim', primary, replica });
  }

  // Async: balas dulu, replica menyusul di belakang
  res.status(202).json({ mode, pesan: `Primary diupdate. Replica baru menyusul ${REPLIKA_DELAY / 1000} detik lagi`, primary, replica });
  wait(REPLIKA_DELAY).then(() => { replica = salinan; log('REPLIKASI (async): replica menyusul, data konsisten'); });
});

app.get('/replikasi/status', (req, res) => {
  res.json({ primary, replica, konsisten: primary.versi === replica.versi });
});
app.post('/replikasi/reset', (req, res) => { primary = dataAwal(); replica = dataAwal(); res.json({ pesan: 'Di-reset', primary, replica }); });

/* ============================================================
   DEMO 4: UPDATE DATA & SINKRONISASI ANTAR KLIEN (VERSIONING)
   ============================================================ */
const dokumenAwal = () => ({ judul: 'Laporan Praktikum', isi: 'Draf awal', versi: 1, diubah_oleh: '-' });
let dokumen = dokumenAwal();

// Baca data terbaru
app.get('/data', (req, res) => res.json(dokumen));

// UPDATE TANPA SINKRONISASI: langsung timpa (last write wins)
app.put('/data/tidak-aman', (req, res) => {
  const { isi, pengubah = 'anonim' } = req.body || {};
  if (!isi) return res.status(400).json({ pesan: 'Field "isi" wajib diisi' });
  dokumen = { ...dokumen, isi, versi: dokumen.versi + 1, diubah_oleh: pengubah };
  log(`UPDATE TIDAK AMAN: ${pengubah} menimpa data -> versi ${dokumen.versi}`);
  res.json({ pesan: 'Update berhasil TANPA cek versi (perubahan orang lain bisa hilang)', dokumen });
});

// UPDATE DENGAN SINKRONISASI: hanya diterima jika klien memegang versi terbaru
app.put('/data/aman', (req, res) => {
  const { isi, versi, pengubah = 'anonim' } = req.body || {};
  if (!isi || versi === undefined) return res.status(400).json({ pesan: 'Field "isi" dan "versi" wajib diisi' });
  if (versi !== dokumen.versi) {
    log(`UPDATE DITOLAK: ${pengubah} memegang versi ${versi}, server versi ${dokumen.versi}`);
    return res.status(409).json({
      pesan: 'Konflik! Data sudah diubah pihak lain. Lakukan sinkronisasi dulu.',
      versi_anda: versi, versi_server: dokumen.versi, data_terbaru: dokumen,
    });
  }
  dokumen = { ...dokumen, isi, versi: dokumen.versi + 1, diubah_oleh: pengubah };
  log(`UPDATE DITERIMA: ${pengubah} -> versi ${dokumen.versi}`);
  res.json({ pesan: 'Update berhasil, versi naik', dokumen });
});

// SINKRONISASI: klien menanyakan "versi saya masih terbaru?"
app.get('/data/sinkron', (req, res) => {
  const versiKlien = parseInt(req.query.versi, 10);
  if (Number.isNaN(versiKlien)) return res.status(400).json({ pesan: 'Gunakan ?versi=angka' });
  if (versiKlien === dokumen.versi) return res.json({ status: 'sudah-sinkron', versi: dokumen.versi });
  res.json({ status: 'perlu-sinkronisasi', versi_anda: versiKlien, versi_server: dokumen.versi, data_terbaru: dokumen });
});

app.post('/data/reset', (req, res) => { dokumen = dokumenAwal(); res.json({ pesan: 'Di-reset', dokumen }); });

app.listen(PORT, '0.0.0.0', () => log(`Server jalan di http://localhost:${PORT}`));