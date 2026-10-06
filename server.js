const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const INFINITE_TAG = (process.env.INFINITE_TAG || "")
  .replace(/^\$/, "")
  .trim();

const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const CONFIG_FILE = path.join(__dirname, "config.json");

const DEFAULT_CONFIG = {
  siteName: "VAKINHA SOLIDÁRIA DO NEPAL",
  profileImage: "",
  campaignImage: "",
  title: "Ajude as famílias afetadas pelas inundações no Nepal",
  text: "O intuito desta Vakinha é ajudar pessoas que tiveram suas casas destruídas pelas inundações no Nepal.",
  extra: "Toda contribuição será importante para ajudar as famílias afetadas.",
  raised: 0,
  goal: 100000,
  donationAmounts: [50, 100, 200, 350, 500, 750],
  primaryColor: "#16a34a",
  buttonColor: "#16a34a",
  backgroundColor: "#f5f6f7",
  donateButtonText: "DOAR AGORA",
  showProfileImage: true
};

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(DEFAULT_CONFIG, null, 2),
        "utf8"
      );

      return { ...DEFAULT_CONFIG };
    }

    const saved = JSON.parse(
      fs.readFileSync(CONFIG_FILE, "utf8")
    );

    return {
      ...DEFAULT_CONFIG,
      ...saved
    };
  } catch (error) {
    console.error("Erro ao carregar configuração:", error);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify(config, null, 2),
    "utf8"
  );
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Basic ")) {
    res.set(
      "WWW-Authenticate",
      'Basic realm="Painel Administrativo"'
    );

    return res.status(401).send("Acesso restrito.");
  }

  const decoded = Buffer.from(
    auth.slice(6),
    "base64"
  ).toString();

  const separator = decoded.indexOf(":");

  const password =
    separator >= 0
      ? decoded.slice(separator + 1)
      : "";

  if (
    !ADMIN_PASSWORD ||
    password !== ADMIN_PASSWORD
  ) {
    res.set(
      "WWW-Authenticate",
      'Basic realm="Painel Administrativo"'
    );

    return res.status(401).send("Senha incorreta.");
  }

  next();
}

function publicBaseUrl(req) {
  return (
    BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  );
}

/*
  Permite receber configurações e imagens
  enviadas pelo painel administrativo.
*/
app.use(
  express.json({
    limit: "8mb"
  })
);

app.use(express.urlencoded({
  extended: true,
  limit: "8mb"
}));

/*
  Arquivos públicos
*/
app.use(
  express.static(path.join(__dirname))
);

/*
  STATUS DO SERVIDOR
*/
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    infiniteTagConfigured: Boolean(INFINITE_TAG)
  });
});

/*
  CONFIGURAÇÃO PÚBLICA
  O site usa esta rota para carregar
  as informações atuais da campanha.
*/
app.get("/api/config", (req, res) => {
  const config = loadConfig();

  res.json(config);
});

/*
  SALVAR CONFIGURAÇÃO
  Esta rota só pode ser usada pelo administrador.
*/
app.post("/api/config", requireAdmin, (req, res) => {
  try {
    const current = loadConfig();

    const body = req.body || {};

    const updated = {
      ...current,

      siteName:
        typeof body.siteName === "string"
          ? body.siteName
          : current.siteName,

      profileImage:
        typeof body.profileImage === "string"
          ? body.profileImage
          : current.profileImage,

      campaignImage:
        typeof body.campaignImage === "string"
          ? body.campaignImage
          : current.campaignImage,

      title:
        typeof body.title === "string"
          ? body.title
          : current.title,

      text:
        typeof body.text === "string"
          ? body.text
          : current.text,

      extra:
        typeof body.extra === "string"
          ? body.extra
          : current.extra,

      raised:
        Number.isFinite(Number(body.raised))
          ? Number(body.raised)
          : current.raised,

      goal:
        Number(body.goal) > 0
          ? Number(body.goal)
          : current.goal,

      donationAmounts:
        Array.isArray(body.donationAmounts)
          ? body.donationAmounts
              .map(Number)
              .filter(
                value =>
                  Number.isFinite(value) &&
                  value > 0
              )
          : current.donationAmounts,

      primaryColor:
        typeof body.primaryColor === "string"
          ? body.primaryColor
          : current.primaryColor,

      buttonColor:
        typeof body.buttonColor === "string"
          ? body.buttonColor
          : current.buttonColor,

      backgroundColor:
        typeof body.backgroundColor === "string"
          ? body.backgroundColor
          : current.backgroundColor,

      donateButtonText:
        typeof body.donateButtonText === "string"
          ? body.donateButtonText
          : current.donateButtonText,

      showProfileImage:
        typeof body.showProfileImage === "boolean"
          ? body.showProfileImage
          : current.showProfileImage
    };

    saveConfig(updated);

    res.json({
      success: true,
      message: "Configuração salva com sucesso.",
      config: updated
    });

  } catch (error) {
    console.error(
      "Erro ao salvar configuração:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Não foi possível salvar a configuração."
    });
  }
});

/*
  CRIAR CHECKOUT INFINITEPAY
*/
app.post("/api/create-checkout", async (req, res) => {
  try {
    if (!INFINITE_TAG) {
      return res.status(500).json({
        error:
          "INFINITE_TAG não configurada no servidor."
      });
    }

    const amount = Number(req.body?.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        error: "Valor de doação inválido."
      });
    }

    const cents = Math.round(amount * 100);

    if (cents < 100) {
      return res.status(400).json({
        error: "O valor mínimo é R$ 1,00."
      });
    }

    const orderNsu =
      `vakinha-${Date.now()}-` +
      crypto.randomBytes(4).toString("hex");

    const base = publicBaseUrl(req);

    const payload = {
      handle: INFINITE_TAG,

      order_nsu: orderNsu,

      redirect_url:
        `${base}/pagamento-concluido.html`,

      webhook_url:
        `${base}/webhook/infinitepay`,

      items: [
        {
          quantity: 1,
          price: cents,
          description:
            "Doação - VAKINHA SOLIDÁRIA DO NEPAL"
        }
      ]
    };

    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(payload)
      }
    );

    const data =
      await response.json().catch(() => ({}));

    if (
      !response.ok ||
      !data.url
    ) {
      console.error(
        "InfinitePay error:",
        response.status,
        data
      );

      return res.status(502).json({
        error:
          "A InfinitePay não retornou um checkout válido.",
        details: data
      });
    }

    res.json({
      checkout_url: data.url,
      order_nsu: orderNsu
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Erro interno ao criar o checkout."
    });
  }
});

/*
  WEBHOOK INFINITEPAY
*/
app.post(
  "/webhook/infinitepay",
  (req, res) => {

    console.log(
      "InfinitePay webhook:",
      JSON.stringify(req.body)
    );

    res.sendStatus(200);
  }
);

/*
  PÁGINA DE PAGAMENTO CONCLUÍDO
*/
app.get(
  "/pagamento-concluido.html",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "pagamento-concluido.html"
      )
    );
  }
);

/*
  PAINEL ADMINISTRATIVO
  Continua protegido pela senha do Render.
*/
app.get(
  "/admin",
  requireAdmin,
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "admin.html"
      )
    );
  }
);

/*
  QUALQUER OUTRA PÁGINA
  Abre o site público.
*/
app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );
});

/*
  INICIAR SERVIDOR
*/
app.listen(PORT, () => {

  console.log(
    `Servidor rodando na porta ${PORT}`
  );

});
