import { fastify } from 'fastify';
import axios from 'axios';
import {Pool} from 'pg';

const pool = new Pool({
  user: 'postgres', // Substitua pelo seu usuário
  host: 'localhost',
  database: 'postgres', // Substitua pelo nome do seu banco de dados
  password: '302382', // Substitua pela sua senha
  port: 5432,
});


const server = fastify();

server.get('/paises/top10', async () => {
  
  const url = 'https://restcountries.com/v3.1/all?fields=name,population';

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erro na requisição: ${response.status}`);
    }

    const data = await response.json();

    const paisesOrdenados = data.sort((a, b) => b.population - a.population);

    const top10Paises = paisesOrdenados.slice(0, 10).map(pais => ({
      nome: pais.name.common,
      populacao: pais.population
    }));
    
    return top10Paises

  } catch (error) {
    console.error("Falha ao buscar os dados:", error);
    return [];
  };

});

server.get('/paises/buscar', async (request, reply) => {
  const { nome } = request.query;

  if (!nome) {
    return reply.code(400).send({
      erro: "O parâmetro 'nome' é obrigatório."
    });
  }

  const urlApi = `https://restcountries.com/v3.1/name/${nome}?fields=name,capital,population,flags,currencies,region`;

  try {
    
    const respostaApi = await axios.get(urlApi);
    
    const dadosPaises = respostaApi.data.map(pais => ({
      nome: pais.name.common,
      capital: pais.capital ? pais.capital[0] : 'N/A',
      populacao: pais.population.toLocaleString(),
      regiao: pais.region,
      bandeira: pais.flags.png,
      moedas: pais.currencies ? Object.values(pais.currencies).map(moeda => moeda.name).join(', ') : 'N/A'
    }));

    reply.send(dadosPaises);

  } catch (error) {
    
    if (error.response && error.response.status === 404) {
      return reply.code(404).send({
        mensagem: `Nenhum país encontrado com o nome '${nome}'.`
      });
    }

    fastify.log.error("Erro ao buscar o país:", error.message);
    reply.code(500).send({
      erro: "Ocorreu um erro interno no servidor."
    });
  }
});

server.post('/paises/avaliar', async (request, reply) => {
  
  const { nome_pais, tipo_avaliacao } = request.body;

  if (!nome_pais || !tipo_avaliacao) {
    return reply.code(400).send({
      erro: "Os campos 'nome_pais' e 'tipo_avaliacao' são obrigatórios."
    });
  }

  const tipo = tipo_avaliacao.toLowerCase();
  if (tipo !== 'positiva' && tipo !== 'negativa') {
    return reply.code(400).send({
      erro: "O valor para 'tipo_avaliacao' deve ser 'positiva' ou 'negativa'."
    });
  }

  const client = await pool.connect();
  try {
    
    const coluna = (tipo === 'positiva') ? 'avaliacao_positiva' : 'avaliacao_negativa';

    const checkQuery = 'SELECT id FROM avaliacoes_paises WHERE nome_pais = $1';
    const checkResult = await client.query(checkQuery, [nome_pais]);

    if (checkResult.rowCount > 0) {
      
      const updateQuery = `
        UPDATE avaliacoes_paises
        SET ${coluna} = ${coluna} + 1
        WHERE nome_pais = $1
        RETURNING ${coluna}
      `;
      const updateResult = await client.query(updateQuery, [nome_pais]);
      const contagemAtualizada = updateResult.rows[0][coluna];

      reply.code(200).send({
        mensagem: `Voto ${tipo} para ${nome_pais} registrado com sucesso.`,
        contagem_atualizada: contagemAtualizada
      });

    } else {
      
      const insertQuery = `
        INSERT INTO avaliacoes_paises (nome_pais, ${coluna})
        VALUES ($1, 1)
        RETURNING *
      `;
      const insertResult = await client.query(insertQuery, [nome_pais]);

      reply.code(201).send({
        mensagem: `Primeiro voto ${tipo} para ${nome_pais} registrado com sucesso.`,
        novo_registro: insertResult.rows[0]
      });
    }

  } catch (error) {
    fastify.log.error('Erro ao registrar avaliação:', error);
    reply.code(500).send({
      erro: 'Ocorreu um erro interno no servidor.'
    });
  } finally {
   
    client.release();
  }
});

server.get('/paises/avaliacoes', async (request, reply) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT nome_pais, avaliacao_positiva, avaliacao_negativa FROM avaliacoes_paises');
    reply.code(200).send(result.rows);
  } catch (error) {
    fastify.log.error('Erro ao buscar avaliações:', error);
    reply.code(500).send({
      erro: 'Ocorreu um erro interno no servidor.'
    });
  } finally {
    client.release();
  }
});



server.listen({
  port: 3333,
});