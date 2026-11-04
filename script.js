const API = "https://api.enem.dev/v1";

const nomes = {
    "linguagens": "Linguagens",
    "ciencias-humanas": "Humanas",
    "ciencias-natureza": "Natureza",
    "matematica": "Matemática"
};

let provasBaixadas = {};   // guarda as provas já baixadas
let questoes = [];         // questões que estão na tela agora
let respostas = [];        // { marcada, conferida } de cada questão
let atual = 0;
let modo = "prova";        // "prova" ou "revisao"
let provaAndando = false;
let finalizada = false;
let relogio = null;
let listaAberta = "";

let caderno = JSON.parse(localStorage.getItem("caderno") || "[]");
let erros = JSON.parse(localStorage.getItem("erros") || "[]");

// ---------- funções pequenas ----------

function mostrar(id) {
    document.querySelectorAll(".tela").forEach(t => t.hidden = true);
    document.querySelector("#" + id).hidden = false;
    window.scrollTo(0, 0);
}

function marcados(classe) {
    return [...document.querySelectorAll(classe)].filter(c => c.checked).map(c => c.value);
}

function idDaQuestao(q) {
    return q.year + "-" + q.index + "-" + (q.language || "pt");
}

function formatar(texto) {
    if (!texto) return "";
    texto = texto.replace(/!\[.*?\]\((.*?)\)/g, '<img src="$1">');
    return texto.replace(/\n/g, "<br>");
}

function salvarLocal() {
    localStorage.setItem("caderno", JSON.stringify(caderno));
    localStorage.setItem("erros", JSON.stringify(erros));
    document.querySelector("#btn-caderno-menu").textContent = `Meu caderno (${caderno.length})`;
    document.querySelector("#btn-erros-menu").textContent = `Caderno de erros (${erros.length})`;
}

// ---------- carregar anos e questões da API ----------

async function carregarAnos() {
    const div = document.querySelector("#anos");
    try {
        const r = await fetch(API + "/exams");
        const provas = await r.json();
        provas.sort((a, b) => b.year - a.year);

        div.innerHTML = "";
        provas.forEach(p => {
            const label = document.createElement("label");
            label.innerHTML = `<input type="checkbox" class="ano" value="${p.year}"> ${p.year}`;
            div.appendChild(label);
        });
    } catch (e) {
        div.textContent = "Não foi possível carregar as provas.";
    }
}

async function buscarProva(ano) {
    if (provasBaixadas[ano]) return provasBaixadas[ano];

    let todas = [];
    let offset = 0;
    let temMais = true;

    while (temMais) {
        const r = await fetch(`${API}/exams/${ano}/questions?limit=50&offset=${offset}`);
        if (!r.ok) throw new Error("Erro ao carregar a prova de " + ano + ". Tente de novo.");
        const dados = await r.json();

        todas = todas.concat(dados.questions);
        temMais = dados.metadata.hasMore;
        offset += 50;
        await new Promise(resolve => setTimeout(resolve, 500)); // espera um pouco entre os pedidos
    }

    provasBaixadas[ano] = todas;
    return todas;
}

// ---------- começar a prova ----------

async function comecar() {
    const aviso = document.querySelector("#aviso");
    const anos = marcados(".ano");
    let materias = marcados(".materia");
    const quantidade = Number(document.querySelector("#quantidade").value);
    const lingua = document.querySelector("#lingua").value;

    if (anos.length === 0) return aviso.textContent = "Escolha pelo menos uma prova.";
    if (!quantidade || quantidade < 1) return aviso.textContent = "Escolha quantas questões você quer.";
    if (materias.length === 0) materias = Object.keys(nomes);

    let todas = [];
    try {
        for (const ano of anos) {
            aviso.textContent = "Carregando ENEM " + ano + "...";
            todas = todas.concat(await buscarProva(ano));
        }
    } catch (e) {
        return aviso.textContent = e.message;
    }

    todas = todas.filter(q =>
        q.correctAlternative &&
        materias.includes(q.discipline) &&
        (!q.language || q.language === lingua)
    );
    if (todas.length === 0) return aviso.textContent = "Nenhuma questão encontrada com esses filtros.";

    todas.sort(() => Math.random() - 0.5); // embaralha
    questoes = todas.slice(0, quantidade);
    respostas = questoes.map(() => ({ marcada: "", conferida: false }));
    atual = 0;
    modo = "prova";
    finalizada = false;
    provaAndando = true;

    aviso.textContent = "";
    iniciarRelogio();
    mostrar("tela-questao");
    mostrarQuestao();
}

function iniciarRelogio() {
    clearInterval(relogio);
    const tempo = document.querySelector("#tempo");
    tempo.textContent = "";

    if (document.querySelector("#modo").value !== "tempo") return;

    let segundos = questoes.length * Number(document.querySelector("#minutos").value) * 60;

    function atualizar() {
        const min = Math.floor(segundos / 60);
        const seg = segundos % 60;
        tempo.textContent = "Tempo: " + min + ":" + String(seg).padStart(2, "0");
    }

    atualizar();
    relogio = setInterval(() => {
        segundos--;
        atualizar();
        if (segundos <= 0) {
            alert("O tempo acabou!");
            finalizar(true);
        }
    }, 1000);
}

// ---------- mostrar a questão na tela ----------

function mostrarQuestao() {
    const q = questoes[atual];
    const r = respostas[atual];

    document.querySelector("#info").textContent =
        `Questão ${atual + 1} de ${questoes.length} — ENEM ${q.year} — ${nomes[q.discipline] || q.discipline} (nº ${q.index})`;
    document.querySelector("#contexto").innerHTML = formatar(q.context);
    document.querySelector("#introducao").innerHTML = formatar(q.alternativesIntroduction);

    document.querySelectorAll(".alternativa").forEach(botao => {
        const letra = botao.dataset.letra;
        const alt = q.alternatives.find(a => a.letter === letra);

        let html = alt ? formatar(alt.text) : "";
        if (alt && alt.file) html += `<img src="${alt.file}">`;
        botao.querySelector(".texto").innerHTML = html;

        botao.className = "alternativa";
        if (r.conferida) {
            if (letra === q.correctAlternative) botao.classList.add("certa");
            else if (letra === r.marcada) botao.classList.add("errada");
        } else if (letra === r.marcada) {
            botao.classList.add("marcada");
        }
    });

    const resultado = document.querySelector("#resultado-questao");
    if (r.conferida) {
        resultado.textContent = r.marcada === q.correctAlternative
            ? "Correto!"
            : "Errado. A resposta certa é a " + q.correctAlternative + ".";
    } else {
        resultado.textContent = "";
    }

    // botões que mudam de acordo com o modo
    const emprova = modo === "prova" && !finalizada;
    document.querySelector("#btn-conferir").hidden = !emprova || r.conferida;
    document.querySelector("#btn-conferir").disabled = !r.marcada;
    document.querySelector("#btn-finalizar").hidden = !emprova;
    document.querySelector("#btn-resultado").hidden = !(modo === "prova" && finalizada);
    document.querySelector("#btn-voltar").hidden = modo !== "revisao";

    const salva = caderno.some(c => idDaQuestao(c) === idDaQuestao(q));
    document.querySelector("#btn-salvar").textContent = salva ? "★ Remover do caderno" : "☆ Salvar no caderno";
}

function marcar(letra) {
    const r = respostas[atual];
    if (r.conferida || finalizada) return;

    r.marcada = letra;
    if (modo === "revisao") conferir(); // no caderno mostra o gabarito na hora
    else mostrarQuestao();
}

function conferir() {
    const q = questoes[atual];
    const r = respostas[atual];
    if (!r.marcada || r.conferida) return;

    r.conferida = true; // depois de conferir não dá mais para mudar

    if (modo === "prova" && r.marcada !== q.correctAlternative) {
        const jaTem = erros.some(e => idDaQuestao(e) === idDaQuestao(q));
        if (!jaTem) erros.push(q);
        salvarLocal();
    }
    mostrarQuestao();
}

function anterior() {
    if (atual > 0) atual--;
    mostrarQuestao();
    window.scrollTo(0, 0);
}

function proxima() {
    if (atual < questoes.length - 1) atual++;
    mostrarQuestao();
    window.scrollTo(0, 0);
}

function salvarNoCaderno() {
    const q = questoes[atual];
    const posicao = caderno.findIndex(c => idDaQuestao(c) === idDaQuestao(q));

    if (posicao >= 0) caderno.splice(posicao, 1);
    else caderno.push(q);

    salvarLocal();
    mostrarQuestao();
}

// ---------- finalizar e resultado ----------

function finalizar(tempoAcabou) {
    const embranco = respostas.filter(r => !r.marcada).length;
    if (!tempoAcabou && embranco > 0) {
        if (!confirm("Você deixou " + embranco + " questão(ões) sem resposta. Finalizar mesmo assim?")) return;
    }

    clearInterval(relogio);
    finalizada = true;
    provaAndando = false;

    // confere todas as que foram marcadas mas não conferidas
    for (let i = 0; i < questoes.length; i++) {
        atual = i;
        conferir();
    }
    atual = 0;

    let acertos = 0;
    const resumo = {};
    questoes.forEach((q, i) => {
        const nome = nomes[q.discipline] || q.discipline;
        if (!resumo[nome]) resumo[nome] = { certas: 0, total: 0 };
        resumo[nome].total++;
        if (respostas[i].marcada === q.correctAlternative) {
            resumo[nome].certas++;
            acertos++;
        }
    });

    document.querySelector("#nota").textContent =
        `Você acertou ${acertos} de ${questoes.length} questões (${embranco} em branco).`;

    const lista = document.querySelector("#resumo");
    lista.innerHTML = "";
    for (const nome in resumo) {
        const li = document.createElement("li");
        li.textContent = `${nome}: ${resumo[nome].certas}/${resumo[nome].total}`;
        lista.appendChild(li);
    }

    mostrar("tela-resultado");
}

function verQuestoes() {
    atual = 0;
    mostrar("tela-questao");
    mostrarQuestao();
}

// ---------- caderno e caderno de erros ----------

function sair(destino) {
    if (provaAndando && !confirm("Se sair agora você perde o progresso da prova. Sair mesmo assim?")) return;

    provaAndando = false;
    clearInterval(relogio);

    if (destino === "inicio") mostrar("tela-inicio");
    else abrirLista(destino);
}

function abrirLista(tipo) {
    listaAberta = tipo;
    const lista = tipo === "caderno" ? caderno : erros;

    document.querySelector("#titulo-lista").textContent = tipo === "caderno" ? "Meu caderno" : "Caderno de erros";

    const div = document.querySelector("#lista");
    div.innerHTML = "";
    if (lista.length === 0) div.textContent = "Nenhuma questão aqui ainda.";

    lista.forEach((q, i) => {
        const linha = document.createElement("div");
        linha.className = "linha";

        const abrir = document.createElement("button");
        abrir.textContent = `ENEM ${q.year} — ${nomes[q.discipline] || q.discipline} — Questão ${q.index}`;
        abrir.onclick = () => abrirDaLista(i);

        const remover = document.createElement("button");
        remover.textContent = "Remover";
        remover.onclick = () => {
            lista.splice(i, 1);
            salvarLocal();
            abrirLista(tipo);
        };

        linha.appendChild(abrir);
        linha.appendChild(remover);
        div.appendChild(linha);
    });

    mostrar("tela-lista");
}

function abrirDaLista(i) {
    questoes = listaAberta === "caderno" ? caderno : erros;
    respostas = questoes.map(() => ({ marcada: "", conferida: false }));
    atual = i;
    modo = "revisao";
    finalizada = false;

    document.querySelector("#tempo").textContent = "";
    mostrar("tela-questao");
    mostrarQuestao();
}

// ---------- quando a página abre ----------

salvarLocal();
carregarAnos();