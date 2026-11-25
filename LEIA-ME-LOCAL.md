# Agenda+ local: como iniciar

## Requisitos

- Node.js 22.13 ou mais recente. O servidor usa o SQLite integrado ao Node.
- Nao e necessario executar npm install; o aplicativo nao usa dependencias externas.

## Iniciar o aplicativo

1. Se houver um servidor antigo aberto, interrompa-o com Ctrl+C no terminal correspondente.
2. Abra esta pasta no Explorador de Arquivos.
3. Execute iniciar.bat (ou, no PowerShell, .\iniciar.bat).
4. Aguarde a mensagem de servidor iniciado e abra http://localhost:3000.

O comando npm start so funciona quando npm esta disponivel no PATH do Windows. Se aparecer que npm nao e reconhecido, use iniciar.bat.

## Conta de demonstracao

- Administrador: admin@demo.local / admin123
- Profissional: prof1@demo.local / prof123
- Recepcao: recepcao@demo.local / recep123

## Funcoes locais

- Agenda, clientes, profissionais, servicos, salas, bloqueios e agendamento online.
- Dashboard com atalhos, calendario mensal, aniversariantes, contas a receber/pagar e fluxo de caixa.
- Financeiro permite criar, editar, marcar como realizado e excluir lancamentos.
- Clientes têm login próprio, histórico de agendamentos e cancelamento de horários pendentes/confirmados.
- Administração e clientes entram por acessos separados; a equipe é criada pelo administrador.

## Testes

Execute testar.bat para validar frontend e API. A suite cria um banco temporario em %TEMP% e o remove ao terminar; ela nao altera os arquivos .db de app/server/data. Tambem e possivel executar npm test quando npm estiver disponivel.

## Limpeza inicial

O administrador pode limpar os registros de demonstração em “Limpar dados iniciais”. A tela mostra uma prévia e exige a senha atual e a frase LIMPAR DADOS DE DEMONSTRACAO. O administrador, clientes, agendamentos, financeiro e configuração do estabelecimento são preservados; itens de demonstração ligados a histórico são arquivados.

## Dados

O servidor local usa app/server/data/agendamento.db por padrao. Na proxima inicializacao, cria a tabela financeira com uma migracao aditiva e mantem os dados existentes. Nao apague nem recrie os arquivos .db.
## Sinal via Pix com conferência manual

O agendamento online gera um QR Code Pix estático com o valor exato de 50% do serviço e também mostra o Pix Copia e Cola. O pagamento vai diretamente para a chave cadastrada em `PIX_CHAVE`. A conferência do crédito é feita pela equipe no aplicativo do banco.

A cliente paga e toca em **Já fiz o Pix**. O pedido aparece no painel do administrador e o alerta sonoro continua até a equipe conferir o crédito no aplicativo/extrato bancário e confirmar ou cancelar o horário. O clique da cliente só avisa a equipe; não confirma que o dinheiro entrou.

A chave já informada está em `.env`. Nome e cidade do recebedor são lidos de Configurações > Estabelecimento; também podem ser definidos por `PIX_NOME_RECEBEDOR` e `PIX_CIDADE_RECEBEDOR`. O código reserva o horário por 15 minutos antes de a cliente informar o pagamento. Depois que ela avisa, a reserva permanece até a equipe analisar.

Cancelamentos com 2 horas ou mais de antecedência solicitam devolução integral do sinal. Com menos de 2 horas, o sistema calcula a retenção de 20% do valor total e mostra ao administrador o valor a devolver manualmente pelo banco. Depois da transferência, o administrador marca a devolução como concluída no alerta do aplicativo. Cancelamentos pela clínica solicitam a devolução integral.

A regra aparece antes do pagamento. Revise os termos com orientação jurídica e confirme que a política está de acordo com os direitos do consumidor aplicáveis.