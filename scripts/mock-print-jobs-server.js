// Servidor mock del contrato asumido de la POS (ver README.md), SOLO para
// probar el polling + confirmación end-to-end de Print Bridge sin esperar a
// que /api/print-jobs exista en el repo real de la POS. No es parte de la
// app ni se empaqueta con ella.
const http = require("http");

let job = {
  id: "job-1",
  ticket: {
    businessName: "Pancherías Cuaqu",
    addressLines: ["Fernando de Magallanes 11", "Costa Azul, Acapulco de Juárez, Gro."],
    folio: "F1TEST01",
    createdAt: new Date().toISOString(),
    payments: [
      { method: "efectivo", amount: 155, cashReceived: 200, changeGiven: 45, reference: null },
    ],
    items: [
      {
        productName: "ChoriDog",
        quantity: 1,
        subtotal: 120,
        modifiers: [{ name: "Tocino crocante", quantity: 2, priceDelta: 20 }],
      },
      { productName: "Refresco", quantity: 1, subtotal: 35, modifiers: [] },
    ],
    total: 155,
  },
};

const server = http.createServer((req, res) => {
  console.log(new Date().toISOString(), req.method, req.url);

  if (req.method === "GET" && req.url === "/api/print-jobs/pending") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jobs: job ? [job] : [] }));
    return;
  }

  const confirmMatch = req.url.match(/^\/api\/print-jobs\/([^/]+)\/confirm$/);
  if (req.method === "POST" && confirmMatch) {
    const id = confirmMatch[1];
    if (job && job.id === id) {
      console.log(`>>> CONFIRMADO: ${id} (folio ${job.ticket.folio}) — se quita de /pending`);
      job = null;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = 8787;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mock print-jobs server escuchando en http://0.0.0.0:${PORT}`);
});
