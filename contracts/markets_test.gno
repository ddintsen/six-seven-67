package markets

import (
	"chain"
	"chain/banker"
	"strings"
	"testing"
	"time"
)

const condition = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const evidence = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

var alice = address("g1dmt3sa5ucvecxuhf3j6ne5r0e3z4x7h6c03xc0")
var bob = address("g1akeqsvhucjt8gf5yupyzjxsjd29wv8fayng37c")
var carol = address("g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm")

func reset() {
	// Unit-package initialization has no deployment MsgAddPackage signer.
	// Model the deployer explicitly; production authorization is unchanged.
	administrator = carol
	pendingAdministrator = ""
	records = make(map[string]*marketRecord)
	marketIDs = nil
	totalEscrowUgnot = 0
	testing.SetOriginSend(nil)
}
func receipt(amount int64) {
	coins := chain.Coins{{Denom: "ugnot", Amount: amount}}
	testing.SetOriginSend(coins)
	testing.IssueCoins(chain.PackageAddress("gno.land/r/nym-sixseven067/markets"), coins)
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
func equalAmount(t *testing.T, got, want int64) {
	t.Helper()
	if got != want {
		t.Errorf("amount got %d, want %d", got, want)
	}
}

// Payment calls remain directly in the crossing test, so AssertOriginCall is
// actually exercised instead of disabled or bypassed by a test wrapper.
func TestWinningClaimsUseBankAndAreProportional(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "bitcoin", "BTC reaches the threshold?", "Exact Coinbase threshold rule.", condition, "111", "222", time.Now().Unix()+10, 420000, administrator)
	receipt(2000000)
	Fund(cross(cur), "bitcoin")
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(420000)
	Buy(cross(cur), "bitcoin", "Yes", 1000000, 420000)
	testing.SetRealm(testing.NewUserRealm(bob))
	receipt(840000)
	Buy(cross(cur), "bitcoin", "Yes", 2000000, 420000)
	testing.SetRealm(testing.NewUserRealm(carol))
	receipt(580000)
	Buy(cross(cur), "bitcoin", "No", 1000000, 580000)
	equalAmount(t, GetMarket("bitcoin").EscrowUgnot, 3840000)
	testing.SetOriginSend(nil)
	testing.SkipHeights(2)
	testing.SetRealm(testing.NewUserRealm(administrator))
	m := GetMarket("bitcoin")
	FinalizeByOracle(cross(cur), "bitcoin", condition, m.RulesHash, "111", "222", "Yes", evidence)
	bank := banker.NewReadonlyBanker()
	aBefore, bBefore := bank.GetCoin(alice, "ugnot"), bank.GetCoin(bob, "ugnot")
	testing.SetRealm(testing.NewUserRealm(alice))
	equalAmount(t, Claim(cross(cur), "bitcoin"), 1000000)
	equalAmount(t, bank.GetCoin(alice, "ugnot")-aBefore, 1000000)
	expectAbort(t, "position already claimed", func() { Claim(cross(cur), "bitcoin") })
	testing.SetRealm(testing.NewUserRealm(bob))
	equalAmount(t, Claim(cross(cur), "bitcoin"), 2000000)
	equalAmount(t, bank.GetCoin(bob, "ugnot")-bBefore, 2000000)
	testing.SetRealm(testing.NewUserRealm(carol))
	equalAmount(t, Claim(cross(cur), "bitcoin"), 0)
	expectAbort(t, "position already claimed", func() { Claim(cross(cur), "bitcoin") })
	equalAmount(t, GetMarket("bitcoin").PaidUgnot, 3000000)
	equalAmount(t, GetMarket("bitcoin").EscrowUgnot, 840000)
	equalAmount(t, totalEscrowUgnot, 840000)
	if !GetPosition("bitcoin", carol).Claimed {
		t.Error("zero payout must close losing position")
	}
}

func TestNoWinnerFractionalSharesAndRounding(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "fractions", "Question?", "Rules", condition, "111", "222", time.Now().Unix()+5, 420000, administrator)
	receipt(20000)
	Fund(cross(cur), "fractions")
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(211)
	Buy(cross(cur), "fractions", "Yes", 501, 420000)
	receipt(8701)
	Buy(cross(cur), "fractions", "No", 15001, 580000)
	equalAmount(t, GetPosition("fractions", alice).SpentUgnot, 8912)
	testing.SetOriginSend(nil)
	testing.SkipHeights(1)
	testing.SetRealm(testing.NewUserRealm(administrator))
	m := GetMarket("fractions")
	FinalizeByOracle(cross(cur), "fractions", condition, m.RulesHash, "111", "222", "No", evidence)
	testing.SetRealm(testing.NewUserRealm(alice))
	equalAmount(t, Claim(cross(cur), "fractions"), 15001)
	equalAmount(t, GetPosition("fractions", alice).PaidUgnot, 15001)
}

func TestOracleAuthorizationBindingAndOneTimeFinality(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "bound", "Question?", "Rules", condition, "111", "222", time.Now().Unix()+5, 420000, bob)
	m := GetMarket("bound")
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "oracle only", func() { FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "111", "222", "Yes", evidence) })
	testing.SetRealm(testing.NewUserRealm(bob))
	expectAbort(t, "source binding mismatch", func() { FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "222", "111", "Yes", evidence) })
	expectAbort(t, "source binding mismatch", func() { FinalizeByOracle(cross(cur), "bound", condition, evidence, "111", "222", "Yes", evidence) })
	expectAbort(t, "source binding mismatch", func() {
		FinalizeByOracle(cross(cur), "bound", "0x"+evidence, m.RulesHash, "111", "222", "Yes", evidence)
	})
	expectAbort(t, "invalid final outcome", func() { FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "111", "222", "0.99", evidence) })
	expectAbort(t, "invalid evidence hash", func() { FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "111", "222", "Yes", "") })
	if GetMarket("bound").Finalized {
		t.Error("failed finalization changed state")
	}
	FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "111", "222", "Yes", evidence)
	expectAbort(t, "outcome already final", func() { FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "111", "222", "No", evidence) })
	if GetMarket("bound").Winner != "Yes" || GetMarket("bound").EvidenceHash != evidence {
		t.Error("final outcome changed")
	}
	// Public getters return detached value copies, never mutable market pointers.
	detached := GetMarket("bound")
	detached.Rules, detached.ConditionID, detached.YesTokenID = "Changed", "Changed", "Changed"
	if GetMarket("bound").Rules != "Rules" || GetMarket("bound").ConditionID != condition {
		t.Error("getter allowed binding mutation")
	}
}

func TestAdminImmutableCreationAndNoPrematureClaim(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "administrator only", func() {
		CreateMarket(cross(cur), "bound", "Question?", "Rules", condition, "111", "222", time.Now().Unix()+5, 420000, bob)
	})
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "bound", "Question?", "Rules", condition, "111", "222", time.Now().Unix()+5, 420000, bob)
	expectAbort(t, "market already exists", func() {
		CreateMarket(cross(cur), "bound", "Other", "Other", condition, "333", "444", time.Now().Unix()+10, 500000, alice)
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "outcome is not final", func() { Claim(cross(cur), "bound") })
	testing.SkipHeights(1)
	testing.SetRealm(testing.NewUserRealm(bob))
	m := GetMarket("bound")
	FinalizeByOracle(cross(cur), "bound", condition, m.RulesHash, "111", "222", "No", evidence)
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "no position", func() { Claim(cross(cur), "bound") })
}

func TestReadOnlyQuotesHashesAndOverflow(t *testing.T) {
	reset()
	equalAmount(t, quoteCost(501, 420000), 211)
	equalAmount(t, quoteCost(15001, 580000), 8701)
	equalAmount(t, quoteCost(1, 1), 1)
	equalAmount(t, quoteCost(1000000, 420000), 420000)
	expectLocalAbort(t, "invalid quote amount", func() { quoteCost(0, 420000) })
	expectLocalAbort(t, "invalid quote amount", func() { quoteCost(-1, 420000) })
	expectLocalAbort(t, "quote overflow", func() { quoteCost(maxInt64, 420000) })
	expectLocalAbort(t, "amount overflow", func() { checkedAdd(maxInt64, 1) })
	expectLocalAbort(t, "invalid outcome", func() { outcomePrice(Market{YesPricePpm: 420000}, "Maybe") })
	if BindingHash("ab", "c") == BindingHash("a", "bc") {
		t.Error("ambiguous binding encoding")
	}
	if BindingHash("Six Seven?", "Exact rules") != "d598971ebce7b2cd6d5c65e57afb18d23f039d8b8e6798e8c42c4dc0d07b6621" {
		t.Error("binding hash differs from backend length framing")
	}
	if BindingHash("é?", "勝") != "5364102f19668e4a74f8877c5723d3724d74d5220a6c9c9a2b1f9b6acff2bf7c" {
		t.Error("binding hash must count UTF-8 bytes")
	}
	if BindingHash("🤡67", "结果: Yes") != "529d293a25b62993c128ff15f1ad250ec7bd3a2a0a973139917d5de4fcad8de8" {
		t.Error("emoji binding hash differs from backend")
	}
	if isHash(strings.Repeat("A", 64)) || isHash("abc") || !isHash(evidence) {
		t.Error("invalid hash accepted")
	}
	if isTokenID("01") || isTokenID("-1") || !isTokenID("0") {
		t.Error("invalid token ID accepted")
	}
}

func TestPaymentEnvelopeValidation(t *testing.T) {
	reset()
	expectLocalAbort(t, "send positive ugnot only", func() { singleSend() })
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 0}})
	expectLocalAbort(t, "send positive ugnot only", func() { singleSend() })
	testing.SetOriginSend(chain.Coins{{Denom: "other", Amount: 1}})
	expectLocalAbort(t, "send positive ugnot only", func() { singleSend() })
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 1}, {Denom: "other", Amount: 1}})
	expectLocalAbort(t, "send positive ugnot only", func() { singleSend() })
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 1}})
	expectLocalAbort(t, "this action does not accept coins", func() { assertNoSend() })
	equalAmount(t, singleSend(), 1)
}

func TestIntermediatePaymentCallCannotBorrowEnvelope(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "invalid non-origin call", func() { Buy(cross(cur), "unknown", "Yes", 1, 420000) })
}

func TestJSONProjectionsAndEscaping(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "json", "Question \"é?\"", "Rules\n\\\x00\t勝", condition, "111", "222", time.Now().Unix()+5, 420000, bob)
	m := GetMarket("json")
	if jsonString("\"\n\\\x00\t\x1fé") != `"\"\n\\\u0000\t\u001fé"` {
		t.Error("JSON string escaping differs")
	}
	want := `{"id":"json","question":"Question \"é?\"","rules":"Rules\n\\\u0000\t勝","rulesHash":` + jsonString(m.RulesHash) +
		`,"conditionId":` + jsonString(condition) + `,"yesTokenId":"111","noTokenId":"222","closesAt":` + decimal(m.ClosesAt) +
		`,"yesPricePpm":420000,"oracle":` + jsonString(string(bob)) + `,"escrowUgnot":"0","yesMicroShares":"0","noMicroShares":"0","finalized":false,"winner":"","evidenceHash":"","finalizedAt":0,"paidUgnot":"0"` +
		`,"quoteVersion":1,"createdAt":` + decimal(m.CreatedAt) + `,"volumeUgnot":"0","trades":0,"holders":0` +
		`,"history":[{"at":` + decimal(m.CreatedAt) + `,"yesPricePpm":420000,"version":1}]}`
	if MarketJSON("json") != want {
		t.Error("market JSON fields differ")
	}
	if PositionJSON("json", alice) != `{"yesMicroShares":"0","noMicroShares":"0","spentUgnot":"0","claimed":false,"paidUgnot":"0"}` {
		t.Error("empty position JSON fields differ")
	}
	records["json"].positions[alice] = Position{YesMicroShares: maxInt64, SpentUgnot: maxInt64, PaidUgnot: maxInt64}
	if PositionJSON("json", alice) != `{"yesMicroShares":"9223372036854775807","noMicroShares":"0","spentUgnot":"9223372036854775807","claimed":false,"paidUgnot":"9223372036854775807"}` {
		t.Error("JSON financial integers lost precision")
	}
}

func TestFundingIsAllocatedPerMarket(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "funded", "Question?", "Rules", condition, "111", "222", time.Now().Unix()+10, 420000, administrator)
	CreateMarket(cross(cur), "empty", "Other question?", "Other rules", condition, "333", "444", time.Now().Unix()+10, 420000, administrator)
	receipt(2000000)
	Fund(cross(cur), "funded")
	testing.SetRealm(testing.NewUserRealm(alice))
	equalAmount(t, GetMarket("empty").EscrowUgnot, 0)
	equalAmount(t, GetMarket("funded").EscrowUgnot, 2000000)
	equalAmount(t, GetPosition("empty", alice).YesMicroShares, 0)
	equalAmount(t, totalEscrowUgnot, 2000000)
	receipt(420000)
	Buy(cross(cur), "funded", "Yes", 1000000, 420000)
	equalAmount(t, GetPosition("funded", alice).YesMicroShares, 1000000)
}

func TestEarlySourceFinalizationAllowsExistingWinnerClaim(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "early", "Threshold reached?", "Any time before the planned deadline", condition, "111", "222", time.Now().Unix()+100, 420000, bob)
	receipt(2000000)
	Fund(cross(cur), "early")
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(420000)
	Buy(cross(cur), "early", "Yes", 1000000, 420000)
	testing.SetOriginSend(nil)
	testing.SetRealm(testing.NewUserRealm(bob))
	m := GetMarket("early")
	FinalizeByOracle(cross(cur), "early", condition, m.RulesHash, "111", "222", "Yes", evidence)
	if !GetMarket("early").Finalized || GetMarket("early").FinalizedAt >= m.ClosesAt {
		t.Error("an early exact oracle result must finalize before the planned deadline")
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	equalAmount(t, GetMarket("early").EscrowUgnot, 2420000)
	equalAmount(t, GetPosition("early", alice).YesMicroShares, 1000000)
	testing.SetOriginSend(nil)
	equalAmount(t, Claim(cross(cur), "early"), 1000000)
}

func TestAdministratorHandoverRequiresAcceptance(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "administrator only", func() { ProposeAdministrator(cross(cur), alice) })
	testing.SetRealm(testing.NewUserRealm(administrator))
	expectAbort(t, "invalid administrator", func() { ProposeAdministrator(cross(cur), carol) })
	ProposeAdministrator(cross(cur), alice)
	if PendingAdministrator() != alice || Administrator() != carol {
		t.Error("proposal must not change the active administrator")
	}
	testing.SetRealm(testing.NewUserRealm(bob))
	expectAbort(t, "pending administrator only", func() { AcceptAdministrator(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(alice))
	AcceptAdministrator(cross(cur))
	if Administrator() != alice || PendingAdministrator() != "" {
		t.Error("accepted administrator not active")
	}
	testing.SetRealm(testing.NewUserRealm(carol))
	expectAbort(t, "administrator only", func() {
		CreateMarket(cross(cur), "old-admin", "Q?", "R.", condition, "1", "2", time.Now().Unix()+10, 500000, carol)
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	CreateMarket(cross(cur), "new-admin", "Q?", "R.", condition, "1", "2", time.Now().Unix()+10, 500000, alice)
}

func TestQuoteUpdatesAreVersionedAndGuardBuys(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "q", "Quote?", "Rules.", condition, "1", "2", time.Now().Unix()+100, 400000, administrator)
	receipt(5000000)
	Fund(cross(cur), "q")
	testing.SetOriginSend(nil)
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "administrator only", func() { SetQuote(cross(cur), "q", 450000, 1) })
	testing.SetRealm(testing.NewUserRealm(administrator))
	expectAbort(t, "quote version changed", func() { SetQuote(cross(cur), "q", 450000, 2) })
	expectAbort(t, "invalid fixed price", func() { SetQuote(cross(cur), "q", 1000000, 1) })
	expectAbort(t, "quote unchanged", func() { SetQuote(cross(cur), "q", 400000, 1) })
	testing.SkipHeights(1)
	SetQuote(cross(cur), "q", 450000, 1)
	m := GetMarket("q")
	if m.YesPricePpm != 450000 || m.QuoteVersion != 2 {
		t.Errorf("quote not applied: %d v%d", m.YesPricePpm, m.QuoteVersion)
	}
	history := QuoteHistory("q")
	if len(history) != 2 || history[0].YesPricePpm != 400000 || history[1].YesPricePpm != 450000 || history[1].Version != 2 {
		t.Error("quote history differs")
	}
	// A buyer who reviewed the old No price cannot execute at the new one.
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(550000)
	Buy(cross(cur), "q", "No", 1000000, 550000)
	receipt(450000)
	Buy(cross(cur), "q", "Yes", 1000000, 450000)
	testing.SetOriginSend(nil)
	m = GetMarket("q")
	equalAmount(t, m.VolumeUgnot, 1000000)
	equalAmount(t, m.Trades, 2)
	if !strings.Contains(MarketJSON("q"), `"holders":1`) {
		t.Error("holder count must count each address once")
	}
	testing.SetRealm(testing.NewUserRealm(administrator))
	m = GetMarket("q")
	FinalizeByOracle(cross(cur), "q", condition, m.RulesHash, "1", "2", "No", evidence)
	expectAbort(t, "trading closed", func() { SetQuote(cross(cur), "q", 500000, 2) })
}

func TestCollectionProjections(cur realm, t *testing.T) {
	reset()
	if MarketsJSON() != "[]" || PositionsJSON(alice) != "[]" {
		t.Error("empty projections differ")
	}
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "a", "A?", "Rules A.", condition, "1", "2", time.Now().Unix()+100, 500000, administrator)
	CreateMarket(cross(cur), "b", "B?", "Rules B.", condition, "3", "4", time.Now().Unix()+100, 250000, administrator)
	receipt(3000000)
	Fund(cross(cur), "b")
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(250000)
	Buy(cross(cur), "b", "Yes", 1000000, 250000)
	testing.SetOriginSend(nil)
	all := MarketsJSON()
	if !strings.HasPrefix(all, `[{"id":"a"`) || !strings.Contains(all, `},{"id":"b"`) || !strings.HasSuffix(all, "]") {
		t.Errorf("markets array differs: %s", all)
	}
	want := `[{"marketId":"b","position":{"yesMicroShares":"1000000","noMicroShares":"0","spentUgnot":"250000","claimed":false,"paidUgnot":"0"}}]`
	if PositionsJSON(alice) != want {
		t.Errorf("positions differ: %s", PositionsJSON(alice))
	}
	if PositionsJSON(bob) != "[]" {
		t.Error("positions leak to another owner")
	}
	page := Render("")
	if !strings.Contains(page, "| [B?](/r/nym-sixseven067/markets:b) | 0.25 | 0.75 | Open until ") {
		t.Errorf("index differs: %s", page)
	}
	detail := Render("b")
	for _, want := range []string{"# B?", "**Yes**\n\n0.25 GNOT", "**No**\n\n0.75 GNOT", "## Rules", "- 1 trade, 0.25 GNOT bought", "[Buy Yes or No on 67](https://six-seven-67-phi.vercel.app/#/market/b)"} {
		if !strings.Contains(detail, want) {
			t.Errorf("market page lacks %q: %s", want, detail)
		}
	}
	if !strings.Contains(Render("nope`x"), "# Market not found") {
		t.Error("unknown market page differs")
	}
}

func TestRenderEscapesSourceText(t *testing.T) {
	if escapeText("a|b *c* [d](e) <f>") != `a\|b \*c\* \[d\](e) \<f\>` {
		t.Errorf("escape differs: %s", escapeText("a|b *c* [d](e) <f>"))
	}
	if priceText(420000) != "0.42" || priceText(425000) != "0.425" || priceText(1000000) != "1.00" || priceText(1) != "0.000001" {
		t.Errorf("price text differs: %s %s %s %s", priceText(420000), priceText(425000), priceText(1000000), priceText(1))
	}
}
