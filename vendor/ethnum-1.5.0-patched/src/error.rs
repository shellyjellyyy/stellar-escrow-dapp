//! Module with hacks for creating error variants for standard library errors
//! without public interfaces.

use core::{
    mem,
    num::{IntErrorKind, ParseIntError, TryFromIntError},
};

/// Returns a `ParseIntError` from an `IntErrorKind`.
pub const fn pie(kind: IntErrorKind) -> ParseIntError {
    unsafe { mem::transmute(kind) }
}

/// Returns a `TryFromIntError`.
///
/// PATCHED: upstream 1.5.0 built this via `unsafe { mem::transmute(()) }`,
/// which assumed `core::num::TryFromIntError` is zero-sized. A Rust stable
/// release changed that type's size, breaking the transmute (see
/// rust-lang/rust#157363 and vendor/README.md at the repo root for the full
/// story). This safe, non-const construction avoids the assumption
/// entirely and was upstream's own fix in ethnum 1.5.3. Every call site of
/// `tfie()` is a regular (non-const) fn, so dropping `const` here is safe.
pub fn tfie() -> TryFromIntError {
    u8::try_from(-1i8).unwrap_err()
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::num::NonZeroU32;

    #[test]
    #[allow(clippy::from_str_radix_10)]
    fn parse_int_error() {
        assert_eq!(
            pie(IntErrorKind::Empty),
            u8::from_str_radix("", 2).unwrap_err(),
        );
        assert_eq!(
            pie(IntErrorKind::InvalidDigit),
            u8::from_str_radix("?", 2).unwrap_err(),
        );
        assert_eq!(
            pie(IntErrorKind::PosOverflow),
            u8::from_str_radix("zzz", 36).unwrap_err(),
        );
        assert_eq!(
            pie(IntErrorKind::NegOverflow),
            i8::from_str_radix("-1337", 10).unwrap_err(),
        );
        assert_eq!(
            pie(IntErrorKind::Zero),
            "0".parse::<NonZeroU32>().unwrap_err(),
        );
    }

    #[test]
    fn try_from_int_error() {
        assert_eq!(tfie(), u8::try_from(-1).unwrap_err());
    }
}
