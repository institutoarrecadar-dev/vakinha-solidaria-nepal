VAKINHA SOLIDÁRIA DO NEPAL — INFINITEPAY

1. Publique esta pasta em uma hospedagem que rode Node.js 18+.
2. Configure as variáveis de ambiente:
   INFINITE_TAG = sua InfiniteTag sem $
   BASE_URL = URL pública do site, com https://
3. Execute: npm install
4. Execute: npm start
5. Acesse /health. Deve aparecer infiniteTagConfigured: true.
6. No site, escolha R$ 50, R$ 100 etc. e clique em DOAR AGORA.

Fluxo:
Site -> /api/create-checkout -> InfinitePay -> checkout -> redirect -> webhook.

IMPORTANTE:
- Não coloque tokens/senhas no HTML.
- O webhook deste pacote apenas recebe e registra no log. Para atualizar automaticamente
  o valor "Arrecadado" com pagamentos confirmados, é necessário banco de dados ou outro
  armazenamento persistente.
- Antes de divulgar a campanha, faça um teste real de baixo valor e confirme no app InfinitePay.
