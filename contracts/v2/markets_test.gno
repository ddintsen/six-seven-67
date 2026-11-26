package markets

import (
	"chain"
	"chain/banker"
	"chain/runtime"
	"strings"
	"testing"
	"time"
)

// Calls that check AssertOriginCall (Fund and Buy) are made directly in each
// test body, and so is every testing.SetRealm, so authorization is exercised
// exactly as on chain rather than bypassed by a helper.

const condition = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const evidence = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const realmPath = "gno.land/r/nym-sixseven067/markets/v2"
const tradingFor int64 = 30 * 24 * 60 * 60

var (
	admin    = chain.PackageAddress("test/admin")
	keeper   = chain.PackageAddress("test/keeper")
	robot    = chain.PackageAddress("test/robot")
	guard    = chain.PackageAddress("test/guardian")
	oracle   = chain.PackageAddress("test/oracle")
	treasury = chain.PackageAddress("test/treasury")
	alice    = chain.PackageAddress("test/alice")
	bob      = chain.PackageAddress("test/bob")
	carol    = chain.PackageAddress("test/carol")
	dave     = chain.PackageAddress("test/dave")
)

// Unit-package initialization has no deployment signer, so every test models
// the roles explicitly. Production authorization is unchanged.
func reset() {
	administrator, pendingAdministrator = admin, ""
	quoter, pendingQuoter = keeper, ""
	guardian, pendingGuardian = guard, ""
	lister, pendingLister = "", ""
	listingOracle, listingTreasury, listingFeePpm = "", "", 0
	realmPaused = false
	quoteTTL, minSpreadPpm, maxExposure, openExposure = 3600, 0, 200000*scale, 0
	defaultLimits = Limits{MaxTradeMicroShares: 500 * scale, MaxHolderMicroShares: 2000 * scale, MaxSideMicroShares: 20000 * scale}
	records = make(map[string]*marketRecord)
	marketIDs = nil
	totalHeldUgnot = 0
	testing.SetOriginSend(nil)
}

// user is the realm of a direct call by who, sending nothing.
func user(who address) runtime.Realm {
	testing.SetOriginSend(nil)
	return testing.NewUserRealm(who)
}

// receipt models a transaction that sends amount ugnot to the realm.
func receipt(amount int64) {
	coins := chain.Coins{{Denom: "ugnot", Amount: amount}}
	testing.SetOriginSend(coins)
	testing.IssueCoins(chain.PackageAddress(realmPath), coins)
}

// pay sends the exact cost plus fee for a purchase and returns the price to
// review, so a test body reads Buy(cross(cur), id, outcome, n, pay(id, outcome, n)).
func pay(id, outcome string, microShares int64) int64 {
	cost, fee := Quote(id, outcome, microShares)
	receipt(cost + fee)
	return outcomePrice(GetMarket(id), outcome)
}
func later(seconds int64) { testing.SkipHeights((seconds + 4) / 5) }

// list creates market id: Yes 0.42 / No 0.60, θ = 0.04, trading for 30 days.
func list(cur realm, id string) {
	testing.SetOriginSend(nil)
	CreateMarket(cross(cur), id, "Will it happen?", "Exact rules.", condition, "111", "222", "Yes", "No", time.Now().Unix()+tradingFor, 420000, 600000, 40000, oracle, treasury, "Politics")
}
func propose(cur realm, id, outcome string) {
	m := GetMarket(id)
	ProposeOutcome(cross(cur), id, m.ConditionID, m.RulesHash, m.YesTokenID, m.NoTokenID, outcome, evidence)
}

func expectAbort(t *testing.T, message string, f func()) {
	t.Helper()
	actual := revive(f)
	if actual != message {
		t.Errorf("want abort %q, got %v", message, actual)
	}
}
func expectLocalAbort(t *testing.T, message string, f func()) {
	t.Helper()
	defer func() {
		actual := recover()
		if actual != message {
			t.Errorf("want local abort %q, got %v", message, actual)
		}
	}()
	f()
}
func equal(t *testing.T, label string, got, want int64) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %d, want %d", label, got, want)
	}
}
func balance(who address) int64 { return banker.NewReadonlyBanker().GetCoin(who, "ugnot") }

func TestFeeFollowsTheTable(t *testing.T) {
	// θ = 0.04, one share: fee = 0.04 × p × (1 − p) GNOT, the table in docs/LAUNCH-PLAN.md.
	equal(t, "0.10", Fee(scale, 100000, 40000), 3600)
	equal(t, "0.25", Fee(scale, 250000, 40000), 7500)
	equal(t, "0.50", Fee(scale, 500000, 40000), 10000)
	equal(t, "0.75", Fee(scale, 750000, 40000), 7500)
	equal(t, "0.90", Fee(scale, 900000, 40000), 3600)
	equal(t, "0.42", Fee(scale, 420000, 40000), 9744)
	equal(t, "rounded up", Fee(1, 500000, 40000), 1)
	equal(t, "rate zero", Fee(scale, 500000, 0), 0)
	equal(t, "cap", Fee(scale, 500000, MaxFeePpm), 17500)
	equal(t, "largest amount", Fee(maxInt64, 500000, MaxFeePpm), 161409010644958577)
	expectLocalAbort(t, "fee rate above the cap", func() { Fee(scale, 500000, MaxFeePpm+1) })
	expectLocalAbort(t, "invalid quote amount", func() { Fee(0, 500000, 40000) })
}

func TestBuyChargesCostPlusFeeAndWinnersArePaid(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(5 * scale)
	Fund(cross(cur), "m")

	testing.SetRealm(user(alice))
	cost, fee := Quote("m", "Yes", scale)
	equal(t, "cost", cost, 420000)
	equal(t, "fee", fee, 9744)
	receipt(cost + fee)
	Buy(cross(cur), "m", "Yes", scale, 420000)
	testing.SetRealm(user(bob))
	Buy(cross(cur), "m", "No", 2*scale, pay("m", "No", 2*scale)) // 1.20 GNOT plus a 0.0192 fee
	m := GetMarket("m")
	equal(t, "escrow", m.EscrowUgnot, 5*scale+420000+1200000)
	equal(t, "fees held", m.FeesUgnot, 9744+19200)
	equal(t, "holders", m.Holders, 2)
	equal(t, "held", totalHeldUgnot, m.EscrowUgnot+m.FeesUgnot)

	testing.SetRealm(user(oracle))
	propose(cur, "m", "Yes")
	testing.SetRealm(user(dave))
	expectAbort(t, "the dispute window is still open", func() { Finalize(cross(cur), "m") })
	later(DisputeWindow)
	Finalize(cross(cur), "m")
	if GetMarket("m").State != StateFinal || GetMarket("m").Outcome != "Yes" {
		t.Fatal("market not final Yes")
	}
	before := balance(alice)
	testing.SetRealm(user(alice))
	equal(t, "alice paid", Claim(cross(cur), "m"), scale)
	equal(t, "alice bank", balance(alice)-before, scale)
	expectAbort(t, "no position", func() { Claim(cross(cur), "m") })
	if GetPosition("m", alice).YesMicroShares != 0 {
		t.Error("claimed position must be deleted")
	}
	testing.SetRealm(user(bob))
	equal(t, "bob paid", Claim(cross(cur), "m"), 0)
	equal(t, "holders left", GetMarket("m").Holders, 0)

	collateral, fees := Surplus("m")
	equal(t, "surplus collateral", collateral, 5*scale+420000+1200000-scale)
	equal(t, "surplus fees", fees, 9744+19200)
	before = balance(treasury)
	testing.SetRealm(user(dave)) // anyone can send the surplus to the fixed treasury
	equal(t, "withdrawn", WithdrawSurplus(cross(cur), "m"), collateral+fees)
	equal(t, "treasury bank", balance(treasury)-before, collateral+fees)
	expectAbort(t, "no surplus", func() { WithdrawSurplus(cross(cur), "m") })
	equal(t, "held after all", totalHeldUgnot, 0)
}

func TestSurplusLeavesUnclaimedWinnersCovered(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(3 * scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(alice))
	Buy(cross(cur), "m", "No", 2*scale, pay("m", "No", 2*scale))
	testing.SetRealm(user(bob))
	Buy(cross(cur), "m", "Yes", scale, pay("m", "Yes", scale))
	testing.SetRealm(user(oracle))
	propose(cur, "m", "No")
	later(DisputeWindow)
	testing.SetRealm(user(carol))
	Finalize(cross(cur), "m")
	WithdrawSurplus(cross(cur), "m") // before alice claims: her 2 GNOT must stay
	equal(t, "escrow left for alice", GetMarket("m").EscrowUgnot, 2*scale)
	testing.SetRealm(user(alice))
	equal(t, "alice paid", Claim(cross(cur), "m"), 2*scale)
	equal(t, "escrow empty", GetMarket("m").EscrowUgnot, 0)
}

func TestVoidRefundsCostAndFee(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(2 * scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(alice))
	Buy(cross(cur), "m", "Yes", 3*scale, pay("m", "Yes", 3*scale))
	Buy(cross(cur), "m", "No", scale, pay("m", "No", scale))
	testing.SetRealm(user(bob))
	Buy(cross(cur), "m", "No", 1500000, pay("m", "No", 1500000))
	pa, pb := GetPosition("m", alice), GetPosition("m", bob)
	testing.SetRealm(user(carol))
	expectAbort(t, "outcome is not final", func() { WithdrawSurplus(cross(cur), "m") })
	testing.SetRealm(user(oracle))
	propose(cur, "m", "Void")
	later(DisputeWindow)
	testing.SetRealm(user(carol))
	Finalize(cross(cur), "m")
	before := balance(alice)
	testing.SetRealm(user(alice))
	equal(t, "alice refund", Claim(cross(cur), "m"), pa.SpentUgnot+pa.FeeUgnot)
	equal(t, "alice bank", balance(alice)-before, pa.SpentUgnot+pa.FeeUgnot)
	collateral, fees := Surplus("m")
	equal(t, "only the reserve is surplus", collateral, 2*scale)
	equal(t, "fees stay owed to bob", fees, 0)
	testing.SetRealm(user(carol))
	WithdrawSurplus(cross(cur), "m")
	testing.SetRealm(user(bob))
	equal(t, "bob refund", Claim(cross(cur), "m"), pb.SpentUgnot+pb.FeeUgnot)
	m := GetMarket("m")
	equal(t, "escrow empty", m.EscrowUgnot, 0)
	equal(t, "fees empty", m.FeesUgnot, 0)
	equal(t, "held", totalHeldUgnot, 0)
}

func TestGuardianCancelsAProposalWithinTheWindow(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(2 * scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(bob))
	Buy(cross(cur), "m", "No", scale, pay("m", "No", scale))
	m := GetMarket("m")
	testing.SetRealm(user(bob))
	expectAbort(t, "oracle only", func() { ProposeOutcome(cross(cur), "m", m.ConditionID, m.RulesHash, "111", "222", "Yes", evidence) })
	testing.SetRealm(user(oracle))
	expectAbort(t, "source binding mismatch", func() { ProposeOutcome(cross(cur), "m", m.ConditionID, m.RulesHash, "222", "111", "Yes", evidence) })
	expectAbort(t, "invalid outcome", func() { ProposeOutcome(cross(cur), "m", m.ConditionID, m.RulesHash, "111", "222", "50-50", evidence) })
	expectAbort(t, "invalid evidence hash", func() { ProposeOutcome(cross(cur), "m", m.ConditionID, m.RulesHash, "111", "222", "Yes", "") })
	propose(cur, "m", "Yes") // wrong
	expectAbort(t, "an outcome is already proposed or final", func() { ProposeOutcome(cross(cur), "m", m.ConditionID, m.RulesHash, "111", "222", "No", evidence) })
	testing.SetRealm(user(admin))
	expectAbort(t, "guardian only", func() { CancelProposal(cross(cur), "m") })
	later(DisputeWindow / 2)
	testing.SetRealm(user(guard))
	CancelProposal(cross(cur), "m")
	if GetMarket("m").State != StatePaused || GetMarket("m").Outcome != "" {
		t.Error("a cancelled proposal must leave the market paused without an outcome")
	}
	testing.SetRealm(user(oracle))
	propose(cur, "m", "No")
	later(DisputeWindow)
	testing.SetRealm(user(guard))
	expectAbort(t, "the dispute window has passed", func() { CancelProposal(cross(cur), "m") })
	testing.SetRealm(user(alice))
	Finalize(cross(cur), "m")
	testing.SetRealm(user(bob))
	equal(t, "bob paid", Claim(cross(cur), "m"), scale)
}

func TestAbandonedMarketsVoidAfterSixtyDays(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(alice))
	Buy(cross(cur), "m", "Yes", scale, pay("m", "Yes", scale))
	p := GetPosition("m", alice)
	testing.SetRealm(user(carol))
	expectAbort(t, "not abandoned yet", func() { VoidAbandoned(cross(cur), "m") })
	later(tradingFor + AbandonAfter - 60)
	expectAbort(t, "not abandoned yet", func() { VoidAbandoned(cross(cur), "m") })
	later(60)
	VoidAbandoned(cross(cur), "m")
	testing.SetRealm(user(alice))
	equal(t, "refund", Claim(cross(cur), "m"), p.SpentUgnot+p.FeeUgnot)
}

func TestQuotesStayInTheBandAddUpAndExpire(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(5 * scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(alice))
	expectAbort(t, "quoter only", func() { SetQuote(cross(cur), "m", 500000, 500000, 1) })
	testing.SetRealm(user(keeper))
	expectAbort(t, "price outside 0.03 to 0.97", func() { SetQuote(cross(cur), "m", 980000, 30000, 1) })
	expectAbort(t, "price outside 0.03 to 0.97", func() { SetQuote(cross(cur), "m", 20000, 980000, 1) })
	expectAbort(t, "Yes and No must add up to at least 1", func() { SetQuote(cross(cur), "m", 500000, 499999, 1) })
	expectAbort(t, "quote version changed", func() { SetQuote(cross(cur), "m", 500000, 500000, 2) })
	SetQuote(cross(cur), "m", 500000, 510000, 1)
	equal(t, "version", GetMarket("m").QuoteVersion, 2)
	later(quoteTTL + 5)
	if time.Now().Unix()-GetMarket("m").QuotedAt <= quoteTTL {
		t.Error("the quote should have expired") // Buy's refusal: TestDirectBuyRefusesAnExpiredQuote
	}
	SetQuote(cross(cur), "m", 500000, 510000, 2) // the same prices renew the quote
	equal(t, "renewal keeps the version", GetMarket("m").QuoteVersion, 2)
	equal(t, "renewal adds no history", int64(len(QuoteHistory("m"))), 2)
	testing.SetRealm(user(alice))
	Buy(cross(cur), "m", "No", scale, pay("m", "No", scale))
	testing.SetRealm(user(admin))
	SetSettings(cross(cur), 600, 20000, maxExposure)
	expectAbort(t, "quote lifetime out of range", func() { SetSettings(cross(cur), 60, 0, maxExposure) })
	testing.SetRealm(user(keeper))
	expectAbort(t, "Yes and No must add up to at least 1", func() { SetQuote(cross(cur), "m", 500000, 510000, 2) })
	SetQuote(cross(cur), "m", 500000, 520000, 2)
	later(tradingFor)
	expectAbort(t, "trading closed", func() { SetQuote(cross(cur), "m", 500000, 530000, 3) })
}

func TestLimitsBoundTradesHoldersMarketsAndTheRealm(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "a")
	receipt(100 * scale)
	Fund(cross(cur), "a")
	list(cur, "b")
	receipt(100 * scale)
	Fund(cross(cur), "b")
	testing.SetRealm(user(admin))
	SetLimits(cross(cur), "a", 5*scale, 8*scale, 12*scale)
	expectAbort(t, "a trade cannot exceed the market limit", func() { SetLimits(cross(cur), "a", 20*scale, 8*scale, 12*scale) })
	// The refusals at each limit are the TestDirectBuyRefuses… tests.
	testing.SetRealm(user(alice))
	Buy(cross(cur), "a", "Yes", 5*scale, pay("a", "Yes", 5*scale))
	testing.SetRealm(user(bob))
	Buy(cross(cur), "a", "Yes", 5*scale, pay("a", "Yes", 5*scale))
	Buy(cross(cur), "a", "No", 2*scale, pay("a", "No", 2*scale))
	equal(t, "exposure", openExposure, 10*scale)
	testing.SetRealm(user(admin))
	SetSettings(cross(cur), 3600, 0, 13*scale)
	testing.SetRealm(user(carol))
	Buy(cross(cur), "b", "No", 3*scale, pay("b", "No", 3*scale))
	equal(t, "exposure at the cap", openExposure, 13*scale)
	testing.SetRealm(user(oracle))
	propose(cur, "a", "Yes")
	later(DisputeWindow)
	testing.SetRealm(user(dave))
	Finalize(cross(cur), "a")
	equal(t, "a final market leaves the exposure", openExposure, 3*scale)
}

func TestPauseStopsBuyingNeverClaiming(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "a")
	receipt(5 * scale)
	Fund(cross(cur), "a")
	list(cur, "b")
	receipt(5 * scale)
	Fund(cross(cur), "b")
	testing.SetRealm(user(alice))
	Buy(cross(cur), "a", "Yes", scale, pay("a", "Yes", scale))
	Buy(cross(cur), "b", "Yes", scale, pay("b", "Yes", scale))
	testing.SetRealm(user(alice))
	expectAbort(t, "quoter, guardian or administrator only", func() { Pause(cross(cur), "a") })
	testing.SetRealm(user(keeper))
	Pause(cross(cur), "a")
	expectAbort(t, "market is not open", func() { Pause(cross(cur), "a") })
	expectAbort(t, "administrator only", func() { Resume(cross(cur), "a") })
	testing.SetRealm(user(guard))
	Pause(cross(cur), "")
	if !IsPaused() {
		t.Error("realm not paused")
	}
	testing.SetRealm(user(oracle))
	propose(cur, "b", "Yes") // the oracle still proposes while the realm is paused
	later(DisputeWindow)
	testing.SetRealm(user(dave))
	Finalize(cross(cur), "b")
	testing.SetRealm(user(alice))
	equal(t, "claim while the realm is paused", Claim(cross(cur), "b"), scale)
	testing.SetRealm(user(admin))
	Resume(cross(cur), "")
	Resume(cross(cur), "a")
	testing.SetRealm(user(keeper))
	SetQuote(cross(cur), "a", 420000, 600000, 1) // renew the expired quote
	testing.SetRealm(user(alice))
	Buy(cross(cur), "a", "Yes", scale, pay("a", "Yes", scale))
	equal(t, "trading again", GetPosition("a", alice).YesMicroShares, 2*scale)
}

func TestRolesHandOverInTwoStepsAndTheOracleIsSeparate(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	end := time.Now().Unix() + 600
	expectAbort(t, "the oracle must be a separate account", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, admin, treasury, "Politics")
	})
	expectAbort(t, "the oracle must be a separate account", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, keeper, treasury, "Politics")
	})
	testing.SetRealm(user(alice))
	expectAbort(t, "administrator only", func() { ProposeRole(cross(cur), "quoter", alice) })
	testing.SetRealm(user(admin))
	ProposeRole(cross(cur), "quoter", alice)
	expectAbort(t, "unknown role", func() { ProposeRole(cross(cur), "oracle", alice) })
	testing.SetRealm(user(bob))
	expectAbort(t, "pending quoter only", func() { AcceptRole(cross(cur), "quoter") })
	testing.SetRealm(user(alice))
	AcceptRole(cross(cur), "quoter")
	if Quoter() != alice {
		t.Error("quoter not handed over")
	}
	testing.SetRealm(user(admin))
	ProposeRole(cross(cur), "admin", bob)
	testing.SetRealm(user(bob))
	AcceptRole(cross(cur), "admin")
	if Administrator() != bob {
		t.Error("administrator not handed over")
	}
	testing.SetRealm(user(admin))
	expectAbort(t, "administrator only", func() { RevokeRole(cross(cur), "quoter") })
	testing.SetRealm(user(bob))
	expectAbort(t, "only the quoter, guardian or lister can be revoked", func() { RevokeRole(cross(cur), "admin") })
	RevokeRole(cross(cur), "quoter")
	list(cur, "m")
	testing.SetRealm(user(alice))
	expectAbort(t, "quoter only", func() { SetQuote(cross(cur), "m", 500000, 500000, 1) })
	testing.SetRealm(user(bob))
	SetQuote(cross(cur), "m", 500000, 500000, 1) // the administrator can always quote
	RevokeRole(cross(cur), "guardian")
	testing.SetRealm(user(oracle))
	propose(cur, "m", "Yes")
	testing.SetRealm(user(guard))
	expectAbort(t, "guardian only", func() { CancelProposal(cross(cur), "m") })
}

func TestListingFixesTermsAndRefusesBadInput(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	end := time.Now().Unix() + 600
	expectAbort(t, "fee rate above the cap", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, MaxFeePpm+1, oracle, treasury, "Politics")
	})
	expectAbort(t, "invalid topic", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "<b>Politics</b>")
	})
	expectAbort(t, "invalid market ID", func() {
		CreateMarket(cross(cur), "Bad ID", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	expectAbort(t, "invalid market ID", func() {
		CreateMarket(cross(cur), "double--dash", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	expectAbort(t, "Yes and No must add up to at least 1", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 570000, 40000, oracle, treasury, "Politics")
	})
	expectAbort(t, "trading must end in the future", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", time.Now().Unix(), 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	receipt(5)
	expectAbort(t, "this action does not accept coins", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	testing.SetOriginSend(nil)
	CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, MaxFeePpm, oracle, treasury, "Politics")
	expectAbort(t, "market already exists", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	m := GetMarket("m")
	equal(t, "fee fixed", m.FeePpm, MaxFeePpm)
	equal(t, "abandon time", m.AbandonAt, end+AbandonAfter)
	if m.Treasury != treasury || m.Oracle != oracle || m.State != StateOpen {
		t.Error("terms not recorded")
	}
}

func TestJSONAndPages(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(2 * scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(alice))
	Buy(cross(cur), "m", "Yes", scale, pay("m", "Yes", scale))
	js := MarketJSON("m")
	for _, part := range []string{`"feePpm":40000`, `"topic":"Politics"`, `"yesPricePpm":420000`, `"noPricePpm":600000`, `"state":"open"`, `"feesUgnot":"9744"`, `"holders":1`, `"treasury":"` + string(treasury) + `"`, `"history":[{"at":`} {
		if !strings.Contains(js, part) {
			t.Errorf("MarketJSON lacks %s: %s", part, js)
		}
	}
	if !strings.Contains(PositionsJSON(alice), `"feeUgnot":"9744"`) {
		t.Errorf("PositionsJSON: %s", PositionsJSON(alice))
	}
	if !strings.Contains(RealmJSON(), `"quoter":"`+string(keeper)+`"`) || !strings.Contains(RealmJSON(), `"disputeWindow":86400`) {
		t.Errorf("RealmJSON: %s", RealmJSON())
	}
	index := Render("")
	for _, part := range []string{"| [Will it happen?](", "| 0.42 | 0.60 |", "θ × shares × price × (1 − price)"} {
		if !strings.Contains(index, part) {
			t.Errorf("index lacks %q:\n%s", part, index)
		}
	}
	page := Render("m")
	for _, part := range []string{"**Yes**\n\n0.42 GNOT", "**No**\n\n0.60 GNOT", "Fee rate θ = 0.04", "[Buy Yes or No on 67](https://the67.click/#/market/m)"} {
		if !strings.Contains(page, part) {
			t.Errorf("market page lacks %q:\n%s", part, page)
		}
	}
	testing.SetRealm(user(oracle))
	propose(cur, "m", "Void")
	if page = Render("m"); !strings.Contains(page, "The oracle proposed Void") || strings.Contains(page, "Buy Yes or No") {
		t.Errorf("proposed page:\n%s", page)
	}
	later(DisputeWindow)
	testing.SetRealm(user(dave))
	Finalize(cross(cur), "m")
	if page = Render("m"); !strings.Contains(page, "**Result**\n\nVoid") || !strings.Contains(page, "takes back what they paid") {
		t.Errorf("void page:\n%s", page)
	}
	if index = Render(""); !strings.Contains(index, "| – | – | Void, refunds open |") {
		t.Errorf("index after void:\n%s", index)
	}
	testing.SetRealm(user(alice))
	Claim(cross(cur), "m")
	if PositionsJSON(alice) != "[]" {
		t.Errorf("claimed position still listed: %s", PositionsJSON(alice))
	}
	if !strings.Contains(Render("nope"), "There is no market `nope`") {
		t.Error("missing market page")
	}
}

func TestMatchMarketsNameTheirOutcomes(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	end := time.Now().Unix() + tradingFor
	for _, names := range [][2]string{{"Lakers", "Lakers"}, {"", "Celtics"}, {" Lakers", "Celtics"}, {"[Lakers](x)", "Celtics"}, {"Lakers", "Celtics\n"}, {strings.Repeat("L", 49), "Celtics"}} {
		expectAbort(t, "invalid outcome names", func() {
			CreateMarket(cross(cur), "match", "Lakers vs. Celtics", "Exact rules.", condition, "111", "222", names[0], names[1], end, 550000, 470000, 40000, oracle, treasury, "Sports")
		})
	}
	CreateMarket(cross(cur), "match", "Lakers vs. Celtics", "Exact rules.", condition, "111", "222", "Lakers", "Celtics", end, 550000, 470000, 40000, oracle, treasury, "Sports")
	m := GetMarket("match")
	if m.YesLabel != "Lakers" || m.NoLabel != "Celtics" {
		t.Errorf("names: %q, %q", m.YesLabel, m.NoLabel)
	}
	if js := MarketJSON("match"); !strings.Contains(js, `"yesLabel":"Lakers","noLabel":"Celtics"`) {
		t.Errorf("MarketJSON lacks the names: %s", js)
	}
	page := Render("match")
	for _, part := range []string{"**Lakers**\n\n0.55 GNOT", "**Celtics**\n\n0.47 GNOT", "[Buy Lakers or Celtics on 67]("} {
		if !strings.Contains(page, part) {
			t.Errorf("match page lacks %q:\n%s", part, page)
		}
	}
	// Yes still means the first token: the oracle proposes Yes for the Lakers.
	testing.SetRealm(user(oracle))
	propose(cur, "match", "Yes")
	if page = Render("match"); !strings.Contains(page, "The oracle proposed Lakers on") {
		t.Errorf("proposed match page:\n%s", page)
	}
	later(DisputeWindow)
	testing.SetRealm(user(dave))
	Finalize(cross(cur), "match")
	if page = Render("match"); !strings.Contains(page, "**Result**\n\nLakers") || !strings.Contains(page, "Lakers won. Holders of Lakers claim") {
		t.Errorf("final match page:\n%s", page)
	}
}

func TestTheListerListsOnlyOnTheListingTerms(cur realm, t *testing.T) {
	reset()
	end := time.Now().Unix() + tradingFor
	testing.SetRealm(user(robot))
	expectAbort(t, "administrator or lister only", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	testing.SetRealm(user(admin))
	ProposeRole(cross(cur), "lister", robot)
	testing.SetRealm(user(robot))
	AcceptRole(cross(cur), "lister")
	expectAbort(t, "the lister must use the listing terms", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
	testing.SetRealm(user(admin))
	expectAbort(t, "the oracle must be a separate account", func() { SetListingTerms(cross(cur), robot, treasury, 40000) })
	expectAbort(t, "fee rate above the cap", func() { SetListingTerms(cross(cur), oracle, treasury, MaxFeePpm+1) })
	SetListingTerms(cross(cur), oracle, treasury, 40000)
	testing.SetRealm(user(robot))
	expectAbort(t, "the lister must use the listing terms", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, dave, treasury, "Politics")
	})
	expectAbort(t, "the lister must use the listing terms", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, robot, "Politics")
	})
	expectAbort(t, "the lister must use the listing terms", func() {
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 70000, oracle, treasury, "Politics")
	})
	CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	if GetMarket("m").Oracle != oracle || GetMarket("m").Treasury != treasury {
		t.Error("listing terms not applied")
	}
	expectAbort(t, "administrator only", func() { SetListingTerms(cross(cur), oracle, robot, 0) })
	if !strings.Contains(RealmJSON(), `"lister":"`+string(robot)+`"`) || !strings.Contains(RealmJSON(), `"feePpm":40000}`) {
		t.Errorf("RealmJSON: %s", RealmJSON())
	}
	testing.SetRealm(user(admin))
	RevokeRole(cross(cur), "lister")
	testing.SetRealm(user(robot))
	expectAbort(t, "administrator or lister only", func() {
		CreateMarket(cross(cur), "n", "Q?", "R", condition, "111", "222", "Yes", "No", end, 420000, 600000, 40000, oracle, treasury, "Politics")
	})
}
