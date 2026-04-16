# Sentinel Ledger — Monetización, premios, referidos, airdrops (especificación archivada)

> **Estado:** CONGELADO para fases posteriores (v4+). **No forma parte del MVP operativo actual.**  
> Implementación futura: Stripe + Solana Pay, tablas Supabase, jobs de expiración, etc.

Este documento consolida lo acordado para cuando exista base de suscriptores y presupuesto de operación.

---

## 1. Planes de suscripción (pagos)

| Plan        | Precio        | Beneficios (resumen)                                      |
|------------|---------------|-----------------------------------------------------------|
| Free       | $0            | 5 análisis/día, delay 6h en métricas core                 |
| Pro        | $9.99/mes     | Todos los tokens, alertas push 15m, sin delay, Pro badge |
| Super Pro  | $19.99/mes    | Alertas 5m, filtros avanzados, IA anti-rug                |
| Lifetime   | $149.99 único| Alertas 1m, acceso API, canal privado                     |

- Métodos: **Stripe (fiat)** + **Solana Pay (crypto)**.  
- Monitor de wallet: escucha `DONATION_WALLET_SOLANA` (cron ~30s), USD vía Jupiter API, actualiza `plan_expires_at`. Anti-spam Redis 24h.

## 2. Micro-pagos y donaciones (PRO temporal)

Montos $1–$100+ mapeados a horas/días PRO, badges (Soporte, Colaborador, Sustentador, Patrocinador) y visibilidad en feed/widget/Telegram según tramo.

## 3. Token $SCOUT (interno)

- 1 día PRO = 10 $SCOUT  
- Caducidad 3 meses  
- Emisión semanal 1.000 / mensual 5.000  

## 4. Referidos (anti-spam)

Recompensas pendientes y activación tras primer escaneo o wallet con historial; bonos por compras Pro / Super Pro / Lifetime (tabla detallada en diseño original).

## 5. Airdrops semanal y mensual

Mínimos de participantes (30 / 100), tabla de premios por puesto, acumulación de jackpot si no se alcanza el mínimo.

## 6. Puntos por interacción

Escanear, alertas PRO, share en X verificado, referidos, donaciones, streak 7/7 — límites semanales y ~400 pts máx/semana.

## 7. Badges de estatus

Cazador, Alpha, Rey del referido, Leyenda, Colaborador, Visionario, Soporte, Sustentador, Patrocinador, Rey de la semana, Leyenda mensual (condiciones por referidos/donaciones/airdrops).

## 8. Alertas y vencimientos

Push: alpha detectado, scam crítico, PRO por expirar, recompensas por reclamar, donación confirmada, loss prevention, morning briefing.  
Vencimientos: recompensas 30 días; PRO según `plan_expires_at`; $SCOUT 3 meses.

## 9. Tablas Supabase (borrador SQL)

```sql
-- Donaciones
CREATE TABLE donations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  tx_hash VARCHAR(255) UNIQUE,
  amount_sol DECIMAL,
  amount_usd DECIMAL,
  reward_days INT,
  badge VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Recompensas pendientes
CREATE TABLE user_rewards (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  reward_type VARCHAR(20),
  amount DECIMAL,
  source_info VARCHAR(100),
  is_claimed BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Referidos
CREATE TABLE referrals (
  id UUID PRIMARY KEY,
  referrer_id UUID REFERENCES users(id),
  referred_id UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending',
  referrer_reward_claimed BOOLEAN DEFAULT false,
  referred_reward_claimed BOOLEAN DEFAULT false,
  bonus_reward_claimed BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Social actions
CREATE TABLE social_actions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  platform VARCHAR(20),
  action_type VARCHAR(30),
  post_url TEXT,
  verified BOOLEAN DEFAULT false,
  reward_days DECIMAL,
  created_at TIMESTAMPTZ
);

-- Airdrops
CREATE TABLE airdrops (
  id UUID PRIMARY KEY,
  type VARCHAR(10),
  period_start DATE,
  period_end DATE,
  prize_1st_usd DECIMAL,
  prize_2nd_pro_days INT,
  prize_3rd_pro_days INT,
  prize_4th_pro_days INT,
  prize_5th_pro_days INT,
  min_participants INT,
  actual_participants INT,
  winner_1st_id UUID REFERENCES users(id),
  winner_2nd_id UUID REFERENCES users(id),
  winner_3rd_id UUID REFERENCES users(id),
  winner_4th_id UUID REFERENCES users(id),
  winner_5th_id UUID REFERENCES users(id),
  is_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
);

-- Puntos por período
CREATE TABLE airdrop_points (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  points INT,
  type VARCHAR(10),
  updated_at TIMESTAMPTZ
);
```

> Ajustar tipos (`gen_random_uuid()`, defaults, índices) antes de aplicar en Supabase.

---

**Fin del archivo archivado.** Para implementar: abrir issue/milestone v4+ y migrar desde `supabase/schema.sql` de forma incremental.
