
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const geminiService = {
  async generateQuestion(category: string, targetName: string): Promise<string> {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Você é o mestre do jogo social "!juizo". Gere uma pergunta EM TERCEIRA PESSOA sobre "${targetName}" na categoria "${category}".
      
      Exemplo: "Qual é o hábito mais estranho que ${targetName} possui escondido?" ou "Se ${targetName} fosse um vilão, qual seria seu plano?"
      
      Regras:
      - Nunca use "você", use sempre o nome "${targetName}".
      - Seja provocativo, inteligente e criativo.
      - Idioma: Português (Brasil). Máximo 12 palavras.`,
      config: { temperature: 1.0 }
    });
    return response.text?.replace(/"/g, '') || `O que ${targetName} faria em uma situação de emergência?`;
  }
};
