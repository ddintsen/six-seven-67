package markets

import (
	"chain"
	"testing"
	"time"
)

// Refusals of the payment calls. Buy and Fund check AssertOriginCall, so each
// refusal is its own test: a same-realm call with the runner's live cur stays
// directly in the test body (no closure, no revive), and a deferred recover
// checks the refusal and that nothing changed.

func paymentFixture(id string) {
	reset()
	now := time.Now().Unix()
	records[id] = &marketRecord{
		market: Market{ID: id, Question: "Question?", Rules: "Exact rules", RulesHash: BindingHash("Question?", "Exact rules"),
			ConditionID: condition, YesTokenID: "111", NoTokenID: "222", Oracle: oracle, Treasury: treasury, FeePpm: 40000,
			CreatedAt: now, TradingEndsAt: now + tradingFor, AbandonAt: now + tradingFor + AbandonAfter,
			YesPricePpm: 420000, NoPricePpm: 600000, QuoteVersion: 1, QuotedAt: now, State: StateOpen,
			MaxTradeMicroShares: defaultLimits.MaxTradeMicroShares, MaxHolderMicroShares: defaultLimits.MaxHolderMicroShares, MaxSideMicroShares: defaultLimits.MaxSideMicroShares},
		positions: make(map[address]Position),
	}
	marketIDs = []string{id}
}

type snapshot struct {
	market   Market
	position Position
	held     int64
	exposure int64
}

func take(id string, owner address) snapshot {
	return snapshot{GetMarket(id), GetPosition(id, owner), totalHeldUgnot, openExposure}
}

func checkRefusal(t *testing.T, actual interface{}, want, id string, owner address, before snapshot) {
	t.Helper()
	if actual != want {
		t.Errorf("want refusal %q, got %v", want, actual)
	}
	after := take(id, owner)
	if after.market != before.market || after.position != before.position || after.held != before.held || after.exposure != before.exposure {
		t.Error("a refused payment changed state")
	}
}

func TestDirectBuyRefusesCostWithoutFee(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	receipt(420000) // the cost of one Yes share, without its 9744 ugnot fee
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "send the exact cost plus fee", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a payment without the fee must be refused")
}

func TestDirectBuyRefusesAChangedReview(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "price does not match review", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 430000)
	t.Error("a price the buyer did not review must be refused")
}

func TestDirectBuyRefusesAnExpiredQuote(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.QuotedAt = time.Now().Unix() - quoteTTL - 1
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "the price expired", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a quote older than its lifetime must be refused")
}

func TestDirectBuyRefusesAPausedMarket(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.State = StatePaused
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "trading paused", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a paused market must refuse purchases")
}

func TestDirectBuyRefusesWhileTheRealmIsPaused(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	realmPaused = true
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "trading paused", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a paused realm must refuse purchases")
}

func TestDirectBuyRefusesAProposedMarket(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.State = StateProposed
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "trading closed", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a proposed outcome must stop trading")
}

func TestDirectBuyRefusesAfterTradingEnds(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.TradingEndsAt = time.Now().Unix()
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "trading closed", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("trading must end at TradingEndsAt")
}

func TestDirectBuyRefusesAboveTheTradeLimit(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.MaxTradeMicroShares = scale / 2
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "above the trade limit", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a trade above the limit must be refused")
}

func TestDirectBuyRefusesAboveTheHolderLimit(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.MaxHolderMicroShares = scale / 2
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "above the holder limit", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a holding above the limit must be refused")
}

func TestDirectBuyRefusesAboveTheMarketLimit(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	records["m"].market.MaxSideMicroShares = scale / 2
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "above the market limit", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a market side above the limit must be refused")
}

func TestDirectBuyRefusesAboveTheRealmExposure(cur realm, t *testing.T) {
	paymentFixture("m")
	receipt(5 * scale)
	Fund(cur, "m")
	maxExposure = scale / 2
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "above the realm exposure limit", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("exposure above the realm cap must be refused")
}

func TestDirectBuyRefusesWithoutCollateral(cur realm, t *testing.T) {
	paymentFixture("m") // no reserve: one share costs 0.42 but would owe 1 GNOT
	pay("m", "Yes", scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "insufficient market collateral", "m", owner, before) }()
	Buy(cur, "m", "Yes", scale, 420000)
	t.Error("a sale the escrow could not pay must be refused")
}

func TestDirectFundRefusesAfterTradingEnds(cur realm, t *testing.T) {
	paymentFixture("m")
	records["m"].market.TradingEndsAt = time.Now().Unix()
	receipt(scale)
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "market funding closed", "m", owner, before) }()
	Fund(cur, "m")
	t.Error("funding must stop when trading ends")
}

func TestDirectFundRefusesAnUncreditedEnvelope(cur realm, t *testing.T) {
	paymentFixture("m")
	totalHeldUgnot = balance(chain.PackageAddress(realmPath)) // the realm owes everything it holds
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: scale}})
	owner := cur.Previous().Address()
	before := take("m", owner)
	defer func() { checkRefusal(t, recover(), "payment not credited to realm", "m", owner, before) }()
	Fund(cur, "m")
	t.Error("coins that never reached the realm must be refused")
}
