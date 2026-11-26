package markets

// Threat scenarios from docs/SECURITY-REVIEW.md, pinned as tests. They pass on
// realm v1 because v1 cannot prevent them; realm v2 must turn R1 and R2 into
// refusals (multisig oracle with a dispute window; a void outcome and an
// abandonment deadline). P1 is the guarantee v1 does keep.
import (
	"chain/banker"
	"testing"
	"time"
)

var dave = address("g1lcv7v9hsy2w0w8tw0l4vkwl3x5m0rh4v6lpn9n")

// R1: one key that is both administrator and oracle can take every coin in a
// market, including the stake of a buyer who was right.
func TestReviewSingleKeyTakesHonestWinners(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", time.Now().Unix()+100, 420000, administrator)
	receipt(5000000)
	Fund(cross(cur), "m")
	testing.SetRealm(testing.NewUserRealm(bob))
	receipt(1740000)
	Buy(cross(cur), "m", "No", 3000000, 580000) // bob is right: No will happen
	testing.SetRealm(testing.NewUserRealm(administrator))
	testing.SetOriginSend(nil)
	SetQuote(cross(cur), "m", 1, 1) // Yes now costs 1 ppm
	receipt(7)
	Buy(cross(cur), "m", "Yes", 6740000, 1) // fills Yes up to the whole escrow for 7 ugnot
	testing.SetOriginSend(nil)
	m := GetMarket("m")
	FinalizeByOracle(cross(cur), "m", condition, m.RulesHash, "111", "222", "Yes", evidence) // false result
	bank := banker.NewReadonlyBanker()
	before := bank.GetCoin(administrator, "ugnot")
	got := Claim(cross(cur), "m")
	testing.SetRealm(testing.NewUserRealm(bob))
	bobGot := Claim(cross(cur), "m")
	t.Logf("R1: key holder paid 7 ugnot and claimed %d ugnot (bank +%d); bob staked 1740000 and got %d", got, bank.GetCoin(administrator, "ugnot")-before, bobGot)
	if got != 6740000 || bobGot != 0 {
		t.Errorf("unexpected: %d %d", got, bobGot)
	}
}

// R2: a source that resolves 50-50, is cancelled, or an oracle key that is lost
// leaves the market with no exit: no void, no refund, no deadline.
func TestReviewNoExitWithoutYesOrNo(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", time.Now().Unix()+5, 500000, administrator)
	receipt(1000000)
	Fund(cross(cur), "m")
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(500000)
	Buy(cross(cur), "m", "Yes", 1000000, 500000)
	testing.SetOriginSend(nil)
	testing.SkipHeights(100)
	testing.SetRealm(testing.NewUserRealm(administrator))
	m := GetMarket("m")
	expectAbort(t, "invalid final outcome", func() { FinalizeByOracle(cross(cur), "m", condition, m.RulesHash, "111", "222", "Void", evidence) })
	expectAbort(t, "invalid final outcome", func() { FinalizeByOracle(cross(cur), "m", condition, m.RulesHash, "111", "222", "50-50", evidence) })
	testing.SetRealm(testing.NewUserRealm(alice))
	expectAbort(t, "outcome is not final", func() { Claim(cross(cur), "m") })
	t.Logf("R2: after closing, %d ugnot stay in escrow with no function that can release them", GetMarket("m").EscrowUgnot)
}

// R3: after the answer is public and before the oracle finalizes, anyone can
// buy the known winner at the old quote. Honest winners are still paid in
// full; the reserve pays the difference.
func TestReviewStaleQuoteDrainsReserveNotUsers(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(administrator))
	CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", time.Now().Unix()+100, 420000, administrator)
	receipt(5000000)
	Fund(cross(cur), "m")
	testing.SetRealm(testing.NewUserRealm(alice))
	receipt(420000)
	Buy(cross(cur), "m", "Yes", 1000000, 420000)
	// The event happens: Yes is certain. The quote has not moved.
	testing.SetRealm(testing.NewUserRealm(dave))
	shares := int64(7620689) // the largest Yes purchase the escrow still covers at 0.42
	cost := quoteCost(shares, 420000)
	receipt(cost)
	Buy(cross(cur), "m", "Yes", shares, 420000)
	testing.SetOriginSend(nil)
	testing.SetRealm(testing.NewUserRealm(administrator))
	m := GetMarket("m")
	FinalizeByOracle(cross(cur), "m", condition, m.RulesHash, "111", "222", "Yes", evidence)
	testing.SetRealm(testing.NewUserRealm(alice))
	aliceGot := Claim(cross(cur), "m")
	testing.SetRealm(testing.NewUserRealm(dave))
	daveGot := Claim(cross(cur), "m")
	t.Logf("R3: alice paid 420000, got %d; dave paid %d, got %d (profit %d); escrow left %d of the 5000000 reserve", aliceGot, cost, daveGot, daveGot-cost, GetMarket("m").EscrowUgnot)
	if aliceGot != 1000000 {
		t.Error("an honest winner must be paid in full")
	}
}

// P1: for random requotes and purchases from many buyers, whichever side wins,
// every winner can claim in full and the escrow never goes negative.
func TestReviewEveryWinnerIsPaid(cur realm, t *testing.T) {
	seed := uint64(67)
	next := func(n int64) int64 {
		seed = seed*6364136223846793005 + 1442695040888963407
		return int64((seed >> 33) % uint64(n))
	}
	buyers := []address{alice, bob, carol, dave, address("g1qqqsyqcyq5rqwzqfpg9scrgwpugpzysn4uzalm")}
	for round := 0; round < 12; round++ {
		reset()
		testing.SetRealm(testing.NewUserRealm(administrator))
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", time.Now().Unix()+1000, 1+next(999998), administrator)
		receipt(1 + next(3000000))
		Fund(cross(cur), "m")
		bought := 0
		for i := 0; i < 40; i++ {
			testing.SetOriginSend(nil)
			if next(4) == 0 {
				testing.SetRealm(testing.NewUserRealm(administrator))
				m := GetMarket("m")
				p := 1 + next(999998)
				if p != m.YesPricePpm {
					SetQuote(cross(cur), "m", p, m.QuoteVersion)
				}
				continue
			}
			who := buyers[next(int64(len(buyers)))]
			outcome := "Yes"
			if next(2) == 0 {
				outcome = "No"
			}
			m := GetMarket("m")
			price := outcomePrice(m, outcome)
			shares := 1 + next(2000000)
			cost := quoteCost(shares, price)
			held := m.YesMicroShares
			other := m.NoMicroShares
			if outcome == "No" {
				held, other = other, held
			}
			if maximum(held+shares, other) > m.EscrowUgnot+cost {
				continue // the realm would refuse; tested elsewhere
			}
			testing.SetRealm(testing.NewUserRealm(who))
			receipt(cost)
			Buy(cross(cur), "m", outcome, shares, price)
			bought++
		}
		testing.SetOriginSend(nil)
		testing.SetRealm(testing.NewUserRealm(administrator))
		winner := "Yes"
		if next(2) == 0 {
			winner = "No"
		}
		m := GetMarket("m")
		FinalizeByOracle(cross(cur), "m", condition, m.RulesHash, "111", "222", winner, evidence)
		var paid, owed int64
		for _, who := range buyers {
			p := GetPosition("m", who)
			if p.YesMicroShares == 0 && p.NoMicroShares == 0 {
				continue
			}
			if winner == "Yes" {
				owed += p.YesMicroShares
			} else {
				owed += p.NoMicroShares
			}
			testing.SetRealm(testing.NewUserRealm(who))
			paid += Claim(cross(cur), "m")
		}
		if paid != owed || GetMarket("m").EscrowUgnot < 0 || totalEscrowUgnot != GetMarket("m").EscrowUgnot {
			t.Errorf("round %d: paid %d owed %d escrow %d", round, paid, owed, GetMarket("m").EscrowUgnot)
		}
		t.Logf("round %d: %d purchases, %s won, paid %d, left in escrow %d", round, bought, winner, paid, GetMarket("m").EscrowUgnot)
	}
}
