# 67 mark: glass blocks (V6)

The V6 mark is built from cubes on a 7 by 6 grid, like a glass-block wall held in a steel frame (Maison de Verre, Maison Hermès; see REFERENCES.md). The 6 occupies columns 0 to 2 and rows 0 to 4; the 7 occupies columns 4 to 6 and stands one block lower, rows 1 to 5. That one-block step is the six-seven gesture caught mid-weigh, and it is the mark's signature.

Construction: each block is drawn in oblique view with a lit top face, a dark side face and a front face whose lighter inner field is the back of the cube seen through the glass. Gap 0.8 and depth 3.2 on a 10-unit cell. The 6 is Yes glass (top #8FE6BD, front #1D7A52, inner #2FA472, side #124D34); the 7 is No glass (top #B4C8FF, front #2C4FC0, inner #4A71E6, side #1C3485). The brand's two colours are the market's two sides.

Source: `src/brand/mark.ts` (grid coordinates) and `src/brand/Mark.tsx` (drawing, plus `markSvg()` for the favicon, which drops the inner fields for small sizes). The mark appears once per screen in the header and small in the footer; it is not repeated as a 3D object or a background, so 67 does not appear everywhere.

Trademark sign (October 12, owner request: "a registered sign next to 67, in our style, so it reads as a brand"). The owner chose ™ because ® may only mark a registered trademark (Ukraine, US, EU); switch the glyph to an R in a circle once the registration exists. The sign is drawn in the same block language as the mark: T on a 3×5 and M on a 5×5 pixel grid, each pixel a fifth of a block, so the sign is exactly one block tall. It is top-aligned with the 6's front faces, hangs 4% of the mark's width to the right of the 7, outside the mark's box (the 67 stays optically centred where it is the header's fulcrum), in the clear glass top tone #A7B8B1, and hidden from assistive technology. `BrandMark` in `src/brand/Mark.tsx` renders the pair; header, menu sheet and footer use it. The favicon carries no sign.

The V1 to V5 drawn wordmark (`public/wordmark.svg`) is kept for history and is no longer used by the interface.
