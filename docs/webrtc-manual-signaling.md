# WebRTC com Sinalização Manual (Copy-Paste)

> Guia completo para comunicação P2P entre navegadores usando **WebRTC** com troca de
> sinalização via **copia-e-cola** (Zero servidor). Aplicável a chats, comandos,
> sincronização de estado, jogos e qualquer interação entre apps de navegador.

---

## Índice

1. [Introdução ao WebRTC](#1-introdução-ao-webrtc)
2. [O Problema da Sinalização](#2-o-problema-da-sinalização)
3. [Protocolo de Sinalização Manual](#3-protocolo-de-sinalização-manual)
4. [Implementação Detalhada](#4-implementação-detalhada)
5. [Template Genérico Reutilizável](#5-template-genérico-reutilizável)
6. [Casos de Uso Além do Chat](#6-casos-de-uso-além-do-chat)
7. [Segurança e Limitações](#7-segurança-e-limitações)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Introdução ao WebRTC

### O que é

**WebRTC** (Web Real-Time Communication) é uma API nativa dos navegadores modernos
que permite comunicação direta (peer-to-peer) de áudio, vídeo e dados entre dois ou
mais dispositivos — **sem passar por nenhum servidor intermediário**.

### Por que usar WebRTC

| Vantagem | Descrição |
|----------|-----------|
| **Zero infraestrutura** | Conexão direta entre navegadores. Você não precisa hospedar nada. |
| **Criptografia obrigatória** | DTLS por especificação — não existe WebRTC sem criptografia. |
| **Baixa latência** | UDP + caminho mais curto possível entre os peers. |
| **Multi-dados** | Suporte a texto, binário, áudio, vídeo e streaming no mesmo canal. |
| **Nativo** | Presente em Chrome, Firefox, Safari, Edge, Opera, Brave — sem plugins. |

### Objetos principais

```
RTCPeerConnection   →  A "linha telefônica". Gerencia a conexão, ICE, criptografia.
RTCDataChannel      →  O "cano de dados". Envia/recebe qualquer dado (string ou binário).
RTCSessionDescription → O "contrato". Descreve codecs, endereços IP, mídias suportadas.
RTCIceCandidate     →  Um "endereço possível" (IP:porta) para alcançar o peer.
```

### Modelo Offer / Answer

Toda conexão WebRTC segue o modelo **Oferta → Resposta**:

1. O **par A** (ofertante) cria um `RTCPeerConnection` e gera uma **oferta SDP**.
2. O **par B** (convidado) recebe a oferta, cria seu próprio `RTCPeerConnection` e
   gera uma **resposta SDP**.
3. Ofertante aplica a resposta do convidado como `remoteDescription`.
4. Ambos trocam **candidatos ICE** (endereços de rede possíveis).
5. Conexão P2P é estabelecida.

---

## 2. O Problema da Sinalização

### Por que a sinalização é necessária

O `RTCPeerConnection` sabe **como** conectar, mas não sabe **com quem**. Para
descobrir o outro par, os navegadores precisam trocar duas informações:

1. **SDP** (Session Description) — metadados da sessão: codecs, mídia, fingerprint
   do certificado DTLS, etc.
2. **Candidatos ICE** — endereços IP:porta onde cada peer pode ser alcançado
   (IP local, IP público via STUN, IP de relay via TURN).

O WebRTC **não define como** essas informações devem ser trocadas. Isso é
deliberado: cada aplicação decide seu canal de sinalização.

### Sinalização tradicional (servidor)

```
┌──────────┐      WebSocket / HTTP       ┌──────────────┐      WebSocket / HTTP       ┌──────────┐
│  Peer A  │ ◄──────────────────────────► │  Servidor de │ ◄──────────────────────────► │  Peer B  │
│ (Chrome) │    envia oferta, ICEs...     │ Sinalização  │    repassa para B...         │ (Firefox)│
└──────────┘                              └──────────────┘                              └──────────┘
```

O servidor de sinalização é apenas um **repassador cego** — não vê as mensagens
(criptografadas) e não participa da comunicação de dados.

### Sinalização manual (Copy-Paste)

Este projeto elimina totalmente o servidor de sinalização usando o conceito de
**"Vanilla ICE"**:

- Em vez de enviar cada candidato ICE separadamente (modo "Trickle ICE"), esperamos
  que **todos** os candidatos sejam descobertos **antes** de gerar o SDP.
- O resultado é uma **única string Base64 por direção** contendo SDP + todos os
  candidatos ICE em uma só mensagem.
- Essa string é copiada e colada manualmente entre os usuários.

```
┌──────────┐   Canal externo (WhatsApp, Telegram, e-mail, SMS...)   ┌──────────┐
│  Peer A  │ ◄───────────────────────────────────────────────────► │  Peer B  │
│ (Chrome) │   1 string Base64 A→B + 1 string Base64 B→A           │ (Firefox)│
└──────────┘                                                        └──────────┘
```

### Comparação: Trickle ICE vs Vanilla ICE

| | Trickle ICE (padrão) | Vanilla ICE (nosso) |
|---|---|---|
| **Troca de SDP** | Imediata | Após ICE gathering completo |
| **Candidatos ICE** | Enviados um a um conforme descobertos | Embutidos no próprio SDP |
| **Mensagens de sinalização** | Várias (SDP + N candidatos) | Apenas 2 (oferta + resposta) |
| **Viável para copy-paste?** | Não (muitas mensagens) | **Sim** (apenas 1 por direção) |

---

## 3. Protocolo de Sinalização Manual

### Diagrama de sequência completo

```
  USUÁRIO A (Ofertante)                      USUÁRIO B (Convidado)
  ═══════════════════                        ════════════════════

  1. Clica em "Criar Sala"
     ┌─────────────────────┐
     │ new RTCPeerConn...  │
     │ pc.createDataChan() │
     │ pc.createOffer()    │
     │ pc.setLocalDesc()   │
     │ waitForIceComplete()│ ◄── Aguarda TODOS os candidatos ICE
     │ encodeSDP() → Base64│
     └─────────────────────┘
            │
            │  OFERTA (string Base64)
            │  "eyJ0eXBlIjoib2ZmZXIiLCJzZHAiOiJ2PT..."
            │
            │  (WhatsApp / Telegram / E-mail / SMS)
            │
            │                                     2. Clica em "Entrar em Sala"
            │                                        ┌─────────────────────┐
            │                                        │ decodeSDP(Base64)  │
            │◄───────────────────────────────────────│ new RTCPeerConn...  │
            │                                        │ pc.setRemoteDesc()  │◄── Aplica oferta de A
            │                                        │ pc.ondatachannel()  │◄── Aguarda canal de A
            │                                        │ pc.createAnswer()   │
            │                                        │ pc.setLocalDesc()   │
            │                                        │ waitForIceComplete()│
            │                                        │ encodeSDP() → Base64│
            │                                        └─────────────────────┘
            │
            │  RESPOSTA (string Base64)
            │  "eyJ0eXBlIjoiYW5zd2VyIiwic2RwIjoi..."
            │
  3. Cola a resposta de B
     ┌─────────────────────┐
     │ decodeSDP(Base64)   │
     │ pc.setRemoteDesc()  │◄── Aplica resposta de B
     └─────────────────────┘
            │
            ▼
  ╔════════════════════════════════════════════╗
  ║       CONEXÃO P2P ESTABELECIDA             ║
  ║       Criptografada com DTLS               ║
  ║       Dados fluem direto entre navegadores  ║
  ╚════════════════════════════════════════════╝
            │
            │  Mensagens via DataChannel
            │◄══════════════════════════════════►│
```

### Por que 4 passos e não 3?

Tecnicamente, são **2 trocas de string** (oferta A→B, resposta B→A) em **4 ações
de usuário**:

| # | Quem | Ação | Dado trafegado |
|---|------|------|----------------|
| 1 | A | Gera oferta + espera ICE | — |
| 2 | A → B | Copia e envia oferta por canal externo | String Base64 |
| 3 | B | Processa oferta + gera resposta + espera ICE | — |
| 4 | B → A | Copia e envia resposta por canal externo | String Base64 |

Após o passo 4, o `RTCPeerConnection` de A recebe a resposta como
`remoteDescription`, e a conexão é estabelecida automaticamente.

### O que acontece durante o ICE gathering

Enquanto `waitForIceComplete()` aguarda, o navegador:

1. Consulta interfaces de rede locais (IPs privados como `192.168.x.x`)
2. Consulta servidores STUN configurados (`stun.l.google.com:19302`) para
   descobrir o IP público e o tipo de NAT
3. Se configurado, consulta servidores TURN para endereços de relay
4. Quando todos os candidatos são descobertos, `iceGatheringState` muda para
   `"complete"`

Isso tipicamente leva de **200ms a 3s**. O timeout no projeto é de **8 segundos**,
após o qual a conexão prossegue mesmo com gathering incompleto.

---

## 4. Implementação Detalhada

### 4.1 Configuração STUN / TURN

```js
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
```

**STUN** (Session Traversal Utilities for NAT):
- Servidor público que responde "qual é o meu IP público?"
- Permite que peers atrás de NAT se descubram
- **Não** transmite dados — só informa endereços

**TURN** (Traversal Using Relays around NAT):
- Retransmissor de dados para quando NAT é muito restritivo (Symmetric NAT)
- Consome largura de banda do servidor → precisa ser auto-hospedado ou pago
- Não incluso neste projeto por simplicidade — a conexão **pode falhar** em
  redes muito restritivas

### 4.2 Codificação SDP → Base64

O SDP é um objeto JavaScript com a estrutura:

```js
{
  type: "offer" | "answer",   // "offer" ou "answer"
  sdp: "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\n..."  // texto SDP
}
```

Precisamos serializá-lo para uma string transportável. O processo é:

```js
// Codificar: objeto JS → string JSON → Base64
function encodeSDP(description) {
  return btoa(JSON.stringify(description));
}

// Decodificar: Base64 → string JSON → objeto JS
function decodeSDP(base64) {
  const obj = JSON.parse(atob(base64.trim()));
  if (!obj.type || !obj.sdp) {
    throw new Error('Objeto SDP inválido');
  }
  return obj;
}
```

**Por que Base64 e não enviar o SDP direto?**
- O SDP contém quebras de linha, caracteres especiais e pode ser muito extenso
- Base64 garante que a string seja segura para copiar, colar, e transmitir por
  qualquer meio sem corrupção

### 4.3 `waitForIceComplete` — o coração da sinalização manual

```js
function waitForIceComplete(connection, timeoutMs = 8000) {
  return new Promise((resolve) => {
    // Se já estiver completo, resolve imediatamente
    if (connection.iceGatheringState === 'complete') {
      resolve('complete');
      return;
    }

    // Timeout de segurança
    const timer = setTimeout(() => resolve('timeout'), timeoutMs);

    // Escuta o evento de mudança de estado
    const handler = () => {
      if (connection.iceGatheringState === 'complete') {
        clearTimeout(timer);
        connection.removeEventListener('icegatheringstatechange', handler);
        resolve('complete');
      }
    };

    connection.addEventListener('icegatheringstatechange', handler);
  });
}
```

**Por que isso é crítico:**

Sem esperar o ICE gathering, o SDP gerado conterá **zero** candidatos ICE.
Quando o outro peer aplicar esse SDP, a conexão nunca será estabelecida porque
nenhum dos lados saberá como alcançar o outro.

Estados do `iceGatheringState`:
| Estado | Significado |
|--------|-------------|
| `"new"` | Nenhum candidato começou a ser coletado |
| `"gathering"` | Coletando candidatos (consultando STUN, varrendo interfaces) |
| `"complete"` | Todos os candidatos foram coletados |

### 4.4 Fluxo do Ofertante (Usuário A)

```js
async function handleGenerateOffer() {
  // 1. Criar RTCPeerConnection com config STUN
  pc = new RTCPeerConnection(RTC_CONFIG);
  isOfferer = true;

  // 2. Criar DataChannel (somente o ofertante cria)
  channel = pc.createDataChannel('chat');
  setupDataChannel(channel);

  // 3. Gerar oferta SDP
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 4. ⚠️ CRÍTICO: Aguardar ICE gathering
  await waitForIceComplete(pc);

  // 5. Codificar e exibir
  const base64Offer = encodeSDP(pc.localDescription);
  // Agora pc.localDescription contém SDP + todos os ICE candidates

  // 6. Mais tarde, quando B enviar a resposta:
  //    const answerDesc = decodeSDP(base64Answer);
  //    await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
}
```

### 4.5 Fluxo do Convidado (Usuário B)

```js
async function handleProcessOffer() {
  const offerDesc = decodeSDP(base64OfferFromA);

  // 1. Criar RTCPeerConnection
  pc = new RTCPeerConnection(RTC_CONFIG);
  isOfferer = false;

  // 2. ⚠️ Registrar ondatachannel ANTES de setRemoteDescription
  pc.ondatachannel = (event) => {
    channel = event.channel;
    setupDataChannel(channel);
  };

  // 3. Aplicar oferta de A como remote description
  await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

  // 4. Gerar resposta SDP
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // 5. ⚠️ CRÍTICO: Aguardar ICE gathering
  await waitForIceComplete(pc);

  // 6. Codificar e enviar de volta para A
  const base64Answer = encodeSDP(pc.localDescription);
  // A aplica essa resposta como remoteDescription → conexão estabelecida
}
```

### 4.6 Configuração do DataChannel

```js
function setupDataChannel(dc) {
  dc.onopen = () => {
    console.log('DataChannel pronto para uso');
    // Transição para tela de chat / iniciar comunicação
  };

  dc.onmessage = (event) => {
    // Suporte a string, ArrayBuffer e Blob
    let text;
    if (typeof event.data === 'string') {
      text = event.data;
    } else if (event.data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(event.data);
    } else if (event.data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => handleMessage(reader.result);
      reader.readAsText(event.data);
      return;
    }
    handleMessage(text);
  };

  dc.onclose = () => {
    console.log('Parceiro desconectou');
  };

  dc.onerror = (e) => {
    console.error('Erro no DataChannel:', e);
  };
}
```

### 4.7 Envio de mensagens

```js
function sendMessage(text) {
  if (!channel || channel.readyState !== 'open') return;
  channel.send(text);
}
```

### 4.8 Estados da conexão

Monitore `pc.connectionState` para feedback de UI:

| Estado | Significado |
|--------|-------------|
| `"new"` | Conexão recém-criada |
| `"connecting"` | Estabelecendo conexão P2P |
| `"connected"` | Conexão estabelecida com sucesso |
| `"disconnected"` | Um ou mais transportes foram perdidos (pode reconectar) |
| `"failed"` | Todos os transportes falharam (conexão perdida definitivamente) |
| `"closed"` | `pc.close()` foi chamado |

```js
pc.onconnectionstatechange = () => {
  console.log('Estado:', pc.connectionState);
  if (pc.connectionState === 'connected') {
    // Conexão ativa
  } else if (pc.connectionState === 'failed') {
    // Tentar reconectar ou informar usuário
  }
};
```

---

## 5. Template Genérico Reutilizável

O arquivo [`webrtc-template.js`](./webrtc-template.js) contém uma classe
autocontida que pode ser copiada para **qualquer projeto**. Resumo da API:

```js
const peer = new WebRTCPeer();

// Ofertante (Usuário A)
const offerB64 = await peer.generateOffer();           // → Base64 string
// ... envia offerB64 para B por canal externo ...
// ... recebe answerB64 de B ...
await peer.applyAnswer(answerB64);                     // Conexão estabelecida

// Convidado (Usuário B)
const answerB64 = await peer.generateAnswer(offerB64); // → Base64 string
// ... envia answerB64 de volta para A ...
// Conexão estabelecida automaticamente

// Envio/recebimento de dados
peer.send('Olá, parceiro!');                           // Envia string
peer.send(new Uint8Array([1, 2, 3]).buffer);          // Envia binário
peer.onMessage((data, type) => {                       // Recebe dados
  console.log('Recebido:', data);
});

// Estado da conexão
peer.onStateChange((state) => { /* 'connecting', 'connected', 'failed'... */ });

// Encerrar
peer.close();
```

---

## 6. Casos de Uso Além do Chat

O `RTCDataChannel` transporta **qualquer dado** — não apenas texto de chat. Com o
mesmo mecanismo de sinalização manual, você pode implementar:

### 6.1 Envio de comandos entre apps

```js
// App A
peer.send(JSON.stringify({ cmd: 'play', timestamp: Date.now() }));

// App B
peer.onMessage((data) => {
  const command = JSON.parse(data);
  if (command.cmd === 'play') executarReproducao(command.timestamp);
});
```

### 6.2 Sincronização de estado (multiplayer leve)

```js
// Jogador A move peça
peer.send(JSON.stringify({ type: 'state', board: [...], turn: 'B' }));

// Jogador B recebe estado
peer.onMessage((data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'state') renderizarTabuleiro(msg.board);
});
```

### 6.3 Transferência de arquivos

```js
async function sendFile(file) {
  const CHUNK_SIZE = 16384; // 16 KB
  const buffer = await file.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

  // Envia metadados primeiro
  peer.send(JSON.stringify({
    type: 'file_meta',
    name: file.name,
    size: file.size,
    chunks: totalChunks
  }));

  // Envia chunks sequencialmente
  for (let i = 0; i < totalChunks; i++) {
    const chunk = buffer.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    peer.send(chunk);
  }
}
```

### 6.4 Streaming de dados em tempo real

O DataChannel tem dois modos:
- **Ordem garantida** (`ordered: true`, padrão) — ideal para comandos e mensagens
- **Sem ordem** (`ordered: false`) — menor latência, ideal para streams de estado

```js
const channel = pc.createDataChannel('stream', {
  ordered: false,        // Não bloqueia por retransmissão
  maxRetransmits: 0      // Descarta pacotes velhos (UDP-like)
});
```

---

## 7. Segurança e Limitações

### 7.1 Criptografia (DTLS)

Toda comunicação WebRTC é **obrigatoriamente criptografada** com DTLS
(Datagram Transport Layer Security). Isso significa:

- ✅ **E2EE garantido** — mesmo se você quiser, não consegue desabilitar.
- ✅ Mesmo em Wi-Fi público, os dados são ininteligíveis para interceptadores.
- ✅ O fingerprint do certificado DTLS está no SDP trocado manualmente,
  garantindo que não há MITM *na conexão P2P em si*.

### 7.2 Risco do canal de sinalização

⚠️ **Ponto de atenção**: a segurança do túnel P2P não protege a sinalização.

- As strings Base64 contêm o fingerprint do certificado DTLS.
- Se um atacante interceptar o Base64 no canal externo e **substituir** antes
  que o destinatário legítimo o use, ele pode realizar um ataque MITM.
- **Sempre compartilhe os códigos Base64 por um canal privado** (WhatsApp, Signal,
  Telegram, e-mail) — nunca publique em fóruns ou redes sociais.

### 7.3 Sem TURN → Conexão pode falhar

| Tipo de NAT | Funciona sem TURN? |
|-------------|---------------------|
| Full Cone NAT | ✅ Sim |
| Restricted Cone NAT | ✅ Sim |
| Port Restricted Cone NAT | ✅ Sim |
| Symmetric NAT | ❌ Só com TURN |

Se ambos os peers estiverem atrás de Symmetric NAT (comum em redes corporativas
e algumas 4G/5G móveis), a conexão **não será estabelecida** sem um servidor TURN.

**Solução**: adicione servidores TURN à configuração:
```js
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:turn.example.com:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
};
```

### 7.4 Limites do DataChannel

- Tamanho máximo de mensagem: ~256 KB em navegadores modernos (especificação
  permite até 4 GB, mas implementações limitam).
- Para arquivos grandes, use chunking (dividir em pedaços).
- Largura de banda: limitada pela menor conexão entre os peers.
- Apenas 2 peers por `RTCPeerConnection`. Para grupos, cada par precisa de uma
  conexão (arquitetura mesh).

---

## 8. Troubleshooting

### 8.1 "Conexão nunca é estabelecida"

**Causas possíveis:**

1. **ICE gathering não completou antes de codificar o SDP.**
   - Verifique se `waitForIceComplete()` foi chamado e resolveu como `"complete"`.
   - Abra `chrome://webrtc-internals` (Chrome) ou `about:webrtc` (Firefox) e
     verifique se há candidatos ICE no SDP trocado.

2. **SDP Base64 foi copiado incorretamente.**
   - As strings Base64 são longas (~800 caracteres). Um caractere faltando
     invalida tudo.
   - O `decodeSDP()` do template já valida e retorna `null` com erro se a
     string for inválida.

3. **Ambos os peers atrás de Symmetric NAT sem TURN.**
   - Verifique `chrome://webrtc-internals` → candidate pairs. Se todos
     falharem, é NAT simétrico.
   - Adicione servidores TURN.

4. **Firewall bloqueando STUN/TURN.**
   - STUN usa porta 3478 (ou 19302 no Google STUN). Alguns firewalls
     corporativos bloqueiam.

### 8.2 "Mensagens não chegam"

- Verifique `channel.readyState` — só envie se for `"open"`.
- O `onmessage` foi registrado **antes** do DataChannel ser aberto?
  - Ofertante: `setupDataChannel()` é chamado logo após `createDataChannel()`.
  - Convidado: `pc.ondatachannel` deve ser registrado **antes** de
    `setRemoteDescription()`.

### 8.3 "Ofertante criou o DataChannel mas convidado não recebeu"

No convidado, `pc.ondatachannel` deve ser configurado **antes** de
`pc.setRemoteDescription()`. Se for configurado depois, o evento já foi
disparado e o DataChannel é perdido.

### 8.4 Ferramentas de debug

| Ferramenta | Navegador | Como acessar |
|------------|-----------|--------------|
| **chrome://webrtc-internals** | Chrome/Edge | Colar na barra de endereço |
| **about:webrtc** | Firefox | Colar na barra de endereço |
| **Safari Web Inspector** | Safari | Develop → WebRTC |

Nessas páginas você pode:
- Ver ofertas/respostas SDP completas
- Ver cada candidato ICE descoberto
- Ver pares de candidatos testados e quais tiveram sucesso
- Ver estatísticas de tráfego e estado da conexão

### 8.5 Checklist para qualquer projeto

- [ ] Configuração de `iceServers` com pelo menos 1 STUN (e TURN se necessário)
- [ ] `waitForIceComplete()` chamado antes de `encodeSDP()`
- [ ] Ofertante: `createDataChannel()` + `setupDataChannel()` configurados
- [ ] Convidado: `pc.ondatachannel` configurado **antes** de `setRemoteDescription()`
- [ ] `encodeSDP()` usa `JSON.stringify` antes do `btoa()`
- [ ] `decodeSDP()` usa `JSON.parse` depois do `atob()`
- [ ] `channel.readyState === 'open'` antes de cada `channel.send()`
- [ ] Monitorar `pc.onconnectionstatechange` para feedback de estado
- [ ] Canais externos para troca do Base64 são privados

---

## Referências

- [MDN: WebRTC API](https://developer.mozilla.org/pt-BR/docs/Web/API/WebRTC_API)
- [MDN: RTCPeerConnection](https://developer.mozilla.org/pt-BR/docs/Web/API/RTCPeerConnection)
- [MDN: RTCDataChannel](https://developer.mozilla.org/pt-BR/docs/Web/API/RTCDataChannel)
- [WebRTC Spec (W3C)](https://www.w3.org/TR/webrtc/)
- [ICE RFC 8445](https://tools.ietf.org/html/rfc8445)

---

> **Código-fonte de referência**: [`app.js`](../app.js) (588 linhas, este projeto).
> **Template reutilizável**: [`webrtc-template.js`](./webrtc-template.js) (classe
> pronta para uso em qualquer projeto).
