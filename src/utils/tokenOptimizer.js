/**
 * Token Usage Optimizer
 * Reduces token consumption by smart truncation and prioritization
 */

class TokenOptimizer {
    constructor() {
        // Rough estimation: 1 token ≈ 4 characters for English
        this.CHARS_PER_TOKEN = 4;
        this.MAX_HISTORY_TOKENS = 1200; // Reserve tokens for history
        this.MAX_MEDIA_TOKENS = 400; // More tokens for media messages
        this.MAX_TEXT_TOKENS = 200; // Less for text messages
    }

    /**
     * Estimate token count from text
     */
    estimateTokens(text) {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }

    /**
     * Truncate text to fit token budget
     */
    truncateToTokens(text, maxTokens) {
        const maxChars = maxTokens * this.CHARS_PER_TOKEN;
        if (text.length <= maxChars) return text;
        return text.substring(0, maxChars) + '...';
    }

    /**
     * Optimize conversation history to fit token budget
     */
    optimizeHistory(messages, maxTokens = this.MAX_HISTORY_TOKENS) {
        const optimized = [];
        let remainingTokens = maxTokens;

        // Process messages in reverse (newest first) to prioritize recent context
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const isMedia = msg.content.includes('[PDF]') || 
                           msg.content.includes('[IMAGE]') || 
                           msg.content.includes('[AUDIO]');
            
            // Allocate more tokens for media messages
            const msgMaxTokens = isMedia ? this.MAX_MEDIA_TOKENS : this.MAX_TEXT_TOKENS;
            const estimatedTokens = this.estimateTokens(msg.content);
            
            if (estimatedTokens > remainingTokens) {
                // Truncate to fit remaining budget
                if (remainingTokens > 50) { // Only include if we have meaningful space
                    const truncated = this.truncateToTokens(msg.content, remainingTokens);
                    optimized.unshift({ ...msg, content: truncated });
                }
                break; // No more budget
            } else {
                // Truncate to max message tokens if needed
                if (estimatedTokens > msgMaxTokens) {
                    const truncated = this.truncateToTokens(msg.content, msgMaxTokens);
                    optimized.unshift({ ...msg, content: truncated });
                    remainingTokens -= msgMaxTokens;
                } else {
                    optimized.unshift(msg);
                    remainingTokens -= estimatedTokens;
                }
            }
        }

        const totalTokens = this.estimateTokens(
            optimized.map(m => m.content).join(' ')
        );

        console.log(`[TOKEN_OPTIMIZER] Optimized ${messages.length} → ${optimized.length} messages, ~${totalTokens} tokens`);
        
        return optimized;
    }

    /**
     * Calculate cost savings
     */
    calculateSavings(originalTokens, optimizedTokens) {
        const GPT4_MINI_INPUT_PRICE = 0.00015; // per 1K tokens
        const originalCost = (originalTokens / 1000) * GPT4_MINI_INPUT_PRICE;
        const optimizedCost = (optimizedTokens / 1000) * GPT4_MINI_INPUT_PRICE;
        const savings = originalCost - optimizedCost;
        const savingsPercent = ((savings / originalCost) * 100).toFixed(1);

        return {
            originalTokens,
            optimizedTokens,
            tokensSaved: originalTokens - optimizedTokens,
            originalCost: originalCost.toFixed(6),
            optimizedCost: optimizedCost.toFixed(6),
            savings: savings.toFixed(6),
            savingsPercent: `${savingsPercent}%`
        };
    }
}

module.exports = new TokenOptimizer();
