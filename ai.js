// ============================================
// ai.js — AIDirector（剧本加载 + DeepSeek API）
// ============================================

class AIDirector {
  constructor() {
    // Runtime AI is intentionally disabled. Never place provider credentials in browser code.
    this.apiKey = null;
    this.apiUrl = 'https://api.deepseek.com/chat/completions';
    this.actSpecs = null;
    this.actData = {};
  }

  // ==================== 加载预写数据 ====================

  async init() {
    try {
      const resp = await fetch('data/acts/act_specs.json');
      this.actSpecs = await resp.json();
      console.log('Loaded act specs:', this.actSpecs.totalActs, 'acts');
    } catch (e) {
      console.warn('act_specs.json not found, using defaults');
    }
  }

  async loadAct(actNum) {
    if (this.actData[actNum]) return this.actData[actNum];
    try {
      const resp = await fetch(`data/acts/act_${actNum}_dialogues.json`);
      const data = await resp.json();
      this.actData[actNum] = data;
      return data;
    } catch (e) {
      console.error(`Failed to load act ${actNum} dialogues:`, e);
      return this._fallbackAct(actNum);
    }
  }

  _fallbackAct(actNum) {
    return {
      actNum,
      narrations: [`第 ${actNum} 幕`],
      dialogues: [],
      playerPrompts: [],
      freeTalk: {},
    };
  }

  // ==================== DeepSeek API ====================

  async callAPI(systemPrompt, userPrompt) {
    if (!this.apiKey) {
      console.warn('Runtime AI is disabled; use a server-side proxy if this feature is enabled later.');
      return null;
    }
    try {
      const resp = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const content = data.choices[0].message.content;
      const json = content.match(/\{[\s\S]*\}/);
      return json ? JSON.parse(json[0]) : null;
    } catch (e) {
      console.error('DeepSeek API error:', e);
      return null;
    }
  }

  // ==================== 动态对话生成（备用）====================

  async generateDynamicReply(npc, context) {
    const systemP = `你是${npc.name}（${npc.role}）。性格：${npc.dialogues?.greeting?.join(' ') || ''}。
用中文回答，1-2句话。`;
    const result = await this.callAPI(systemP, context);
    return result?.reply || npc.getLine('greeting');
  }
}
