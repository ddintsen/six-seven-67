package markets

import (
	"chain"
	"testing"
	"time"
)

// A same-realm call with the runner's live cur is supported by Gno. Keeping
// Buy/Fund directly in Test preserves the origin-call frame count; regular
// defer/recover checks the refusal without adding a revive/cross boundary.
// The runner starts with an empty test EOA identity. These fixtures model
// existing markets; creation and real-format caller identities are exercised
// by the separate crossing tests. Deployment signer capture is not tested.
func paymentFixture(id string, closesAt int64) {
	reset()
	records[id] = &marketRecord{
		market:    Market{ID: id, Question: "Question?", Rules: "Exact rules", RulesHash: BindingHash("Question?", "Exact rules"), ConditionID: condition, YesTokenID: "111", NoTokenID: "222", ClosesAt: closesAt, YesPricePpm: 420000, Oracle: bob},
		positions: make(map[address]Position),
	}
	marketIDs = []string{id}
}

func TestDirectPaymentRejectsChangedReview(cur realm, t *testing.T) {
	paymentFixture("case", time.Now().Unix()+5)
	receipt(2000000)
	Fund(cur, "case")
	receipt(420000)
	before := GetMarket("case")
	owner := cur.Previous().Address()
	position := GetPosition("case", owner)
	defer func() {
		checkPaymentRefusal(t, recover(), "price does not match review", "case", owner, before, position, 2000000)
	}()
	Buy(cur, "case", "Yes", 1000000, 430000)
	t.Error("a changed review must refuse payment")
}

func TestDirectPaymentRejectsInexactAmount(cur realm, t *testing.T) {
	paymentFixture("case", time.Now().Unix()+5)
	receipt(2000000)
	Fund(cur, "case")
	receipt(420001)
	before := GetMarket("case")
	owner := cur.Previous().Address()
	position := GetPosition("case", owner)
	defer func() {
		checkPaymentRefusal(t, recover(), "send the exact quoted ugnot amount", "case", owner, before, position, 2000000)
	}()
	Buy(cur, "case", "Yes", 1000000, 420000)
	t.Error("an inexact payment must refuse")
}

func TestDirectBuyRejectsAfterDeadline(cur realm, t *testing.T) {
	paymentFixture("case", time.Now().Unix()+5)
	receipt(2000000)
	Fund(cur, "case")
	testing.SkipHeights(1)
	receipt(420000)
	before := GetMarket("case")
	owner := cur.Previous().Address()
	position := GetPosition("case", owner)
	defer func() { checkPaymentRefusal(t, recover(), "trading closed", "case", owner, before, position, 2000000) }()
	Buy(cur, "case", "Yes", 1000000, 420000)
	t.Error("trading after the deadline must refuse")
}

func TestDirectFundRejectsAfterDeadline(cur realm, t *testing.T) {
	paymentFixture("case", time.Now().Unix()+5)
	testing.SkipHeights(1)
	receipt(1)
	before := GetMarket("case")
	owner := cur.Previous().Address()
	position := GetPosition("case", owner)
	defer func() { checkPaymentRefusal(t, recover(), "market funding closed", "case", owner, before, position, 0) }()
	Fund(cur, "case")
	t.Error("funding after the deadline must refuse")
}

func TestDirectFundRejectsUncreditedEnvelope(cur realm, t *testing.T) {
	paymentFixture("case", time.Now().Unix()+5)
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 1}})
	before := GetMarket("case")
	owner := cur.Previous().Address()
	position := GetPosition("case", owner)
	defer func() {
		checkPaymentRefusal(t, recover(), "payment not credited to realm", "case", owner, before, position, 0)
	}()
	Fund(cur, "case")
	t.Error("an uncredited payment envelope must refuse")
}

func TestDirectBuyCannotUseAnotherMarketsCollateral(cur realm, t *testing.T) {
	paymentFixture("funded", time.Now().Unix()+5)
	empty := GetMarket("funded")
	empty.ID = "empty"
	records["empty"] = &marketRecord{market: empty, positions: make(map[address]Position)}
	receipt(2000000)
	Fund(cur, "funded")
	receipt(420000)
	owner := cur.Previous().Address()
	position := GetPosition("empty", owner)
	defer func() {
		checkPaymentRefusal(t, recover(), "insufficient market collateral", "empty", owner, empty, position, 2000000)
		equalAmount(t, GetMarket("funded").EscrowUgnot, 2000000)
	}()
	Buy(cur, "empty", "Yes", 1000000, 420000)
	t.Error("another market's collateral must not back this buy")
}

func TestDirectBuyRejectsAfterEarlyFinalization(cur realm, t *testing.T) {
	paymentFixture("early", time.Now().Unix()+100)
	// This runner's captured EOA is the pinned test oracle. The separate
	// crossing tests exercise real-format oracle addresses and unauthorized EOAs.
	records["early"].market.Oracle = cur.Previous().Address()
	receipt(2000000)
	Fund(cur, "early")
	receipt(420000)
	Buy(cur, "early", "Yes", 1000000, 420000)
	testing.SetOriginSend(nil)
	m := GetMarket("early")
	FinalizeByOracle(cur, "early", condition, m.RulesHash, "111", "222", "Yes", evidence)
	before := GetMarket("early")
	if !before.Finalized || before.FinalizedAt >= before.ClosesAt {
		t.Fatal("fixture must finalize before its planned deadline")
	}
	receipt(420000)
	owner := cur.Previous().Address()
	position := GetPosition("early", owner)
	defer func() { checkPaymentRefusal(t, recover(), "trading closed", "early", owner, before, position, 2420000) }()
	Buy(cur, "early", "Yes", 1000000, 420000)
	t.Error("early finality must immediately stop buying")
}

func TestDirectFundRejectsAfterEarlyFinalization(cur realm, t *testing.T) {
	paymentFixture("early", time.Now().Unix()+100)
	records["early"].market.Oracle = cur.Previous().Address()
	receipt(2000000)
	Fund(cur, "early")
	testing.SetOriginSend(nil)
	m := GetMarket("early")
	FinalizeByOracle(cur, "early", condition, m.RulesHash, "111", "222", "Yes", evidence)
	before := GetMarket("early")
	if !before.Finalized || before.FinalizedAt >= before.ClosesAt {
		t.Fatal("fixture must finalize before its planned deadline")
	}
	receipt(1)
	owner := cur.Previous().Address()
	position := GetPosition("early", owner)
	defer func() {
		checkPaymentRefusal(t, recover(), "market funding closed", "early", owner, before, position, 2000000)
	}()
	Fund(cur, "early")
	t.Error("early finality must immediately stop funding")
}

func checkPaymentRefusal(t *testing.T, actual interface{}, want, id string, owner address, market Market, position Position, total int64) {
	t.Helper()
	if actual != want {
		t.Errorf("want refusal %q, got %v", want, actual)
	}
	if GetMarket(id) != market {
		t.Error("refused payment changed market state")
	}
	if GetPosition(id, owner) != position {
		t.Error("refused payment changed position")
	}
	equalAmount(t, totalEscrowUgnot, total)
}

func TestDirectBuyRejectsPriceReviewedBeforeRequote(cur realm, t *testing.T) {
	paymentFixture("case", time.Now().Unix()+5)
	receipt(2000000)
	Fund(cur, "case")
	testing.SetOriginSend(nil)
	administrator = cur.Previous().Address()
	records["case"].market.QuoteVersion = 1
	SetQuote(cur, "case", 450000, 1)
	receipt(580000)
	before := GetMarket("case")
	owner := cur.Previous().Address()
	position := GetPosition("case", owner)
	defer func() {
		checkPaymentRefusal(t, recover(), "price does not match review", "case", owner, before, position, 2000000)
	}()
	Buy(cur, "case", "No", 1000000, 580000)
	t.Error("a price reviewed before a requote must refuse payment")
}
