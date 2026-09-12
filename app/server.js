const express = require('express');
const app = express();

app.use(express.json());

const mahasiswa = [
    {
        nim: "362558302102",
        nama: "Fachreza Huditama",
        status: "Aktif"
    },
    {
        nim: "362558302038",
        nama: "Cahaya Wulandari",
        status: "Aktif"
    },
    {
        nim: "362558302042",
        nama: "Fasa Ufa Fiaunilla",
        status: "Aktif"
    },
    {
        nim: "362558302037",
        nama: "Risma Setio Muhtafiroh",
        status: "Aktif"
    }
];

const produk = [
    {
        id: 1,
        nama: "Dasi Hitam",
        harga: 50000
    },
    {
        id: 2,
        nama: "Sepatu Adidas",
        harga: 4500000
    },
    {
        id: 3,
        nama: "Baju Kemeja",
        harga: 450000
    },
    {
        id: 4,
        nama: "Tas Ransel",
        harga: 1750000
    },
    {
        id: 5,
        nama: "Jas Hujan",
        harga: 950000
    }
];

app.get('/', (req, res) => {
  res.status(200).send({
    message: "HTTP server praktikum interoperabilitas"
  });
});

app.get('/mahasiswa', (req, res) => {
  res.status(200).json(mahasiswa);
});

app.get('/mahasiswa/:nim', (req, res) => {
  const data = mahasiswa.find(m => m.nim === req.params.nim);
  data ? res.status(200).json(data) : res.status(404).json({ message: "Mahasiswa tidak ditemukan" });
});

app.post("/mahasiswa", (req, res) => { 
    const dataBaru = req.body; 
    mahasiswa.push(dataBaru); 
    res.status(201).json({ 
        message: "Mahasiswa berhasil ditambahkan", 
        data: dataBaru 
    }); 
}); 

app.patch("/mahasiswa/:nim", (req, res) => { 
    const data = mahasiswa.find(m => m.nim === req.params.nim); 
    if (!data) return res.status(404).json({ message: "Mahasiswa tidak ditemukan" }); 
    
    Object.assign(data, req.body); 
    res.status(200).json({ 
        message: "Data berhasil diperbarui", 
        data: data 
    }); 
}); 

app.delete("/mahasiswa/:nim", (req, res) => {
    const index = mahasiswa.findIndex(m => m.nim === req.params.nim); 
    if (index === -1) return res.status(404).json({ message: "Mahasiswa tidak ditemukan" }); 
    
    mahasiswa.splice(index, 1); 
    res.status(200).json({ 
        message: "Mahasiswa berhasil dihapus" 
    }); 
}); 

app.get('/produk', (req, res) => {
  res.status(200).json(produk);
});

app.get('/produk/:id', (req, res) => {
  const data = produk.find(p => p.id === parseInt(req.params.id));
  data ? res.status(200).json(data) : res.status(404).json({ message: "Produk tidak ditemukan" });
});

app.post("/produk", (req, res) => {
    const dataBaru = req.body; 
    produk.push(dataBaru);
    res.status(201).json({
        message: "Produk berhasil ditambahkan",
        data: dataBaru
    });
});

app.patch("/produk/:id", (req, res) => {
    const data = produk.find(p => p.id === parseInt(req.params.id));
    if (!data) return res.status(404).json({ message: "Produk tidak ditemukan" }); 
    
    Object.assign(data, req.body);
    res.status(200).json({
        message: "Data berhasil diperbarui",
        data: data
    });
});

app.delete("/produk/:id", (req, res) => { 
    const index = produk.findIndex(p => p.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ message: "Produk tidak ditemukan" });
    
    produk.splice(index, 1);
    res.status(200).json({
        message: "Produk berhasil dihapus"
    });
});

app.listen(3000, () => {
  console.log('Server sedang berjalan di port 3000');
});
