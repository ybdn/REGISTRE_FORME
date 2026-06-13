#!/usr/bin/env python3
"""Génère les icônes de l'app à partir du logotype « R_ ».

Identité visuelle : fond #0F141B (couleur `fond` du thème), glyphes blancs,
police Space Grotesk SemiBold (= typo.titre du design system). Tout est rendu
en 1024×1024, le format attendu par Expo.

Sorties :
  assets/icon.png           icône plein cadre (iOS + fallback) — fond noir
  assets/adaptive-icon.png  premier plan Android, fond transparent, glyphes
                            cadrés dans la zone de sécurité (masque adaptatif)
  assets/splash-icon.png    logotype seul sur fond transparent pour l'écran
                            de démarrage

Réexécuter après toute modif :  python3 scripts/generer-icone.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
POLICE = (
    RACINE
    / "node_modules/@expo-google-fonts/space-grotesk/SpaceGrotesk_600SemiBold.ttf"
)
ASSETS = RACINE / "assets"

TAILLE = 1024
TEXTE = "R_"
# Fond aligné sur la couleur `fond` du design system (#0F141B) pour une
# transition splash → app sans rupture.
FOND = (15, 20, 27, 255)
BLANC = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def rendre_logotype(taille_police: int) -> Image.Image:
    """Dessine « R_ » blanc sur un calque transparent, recadré au plus juste."""
    police = ImageFont.truetype(str(POLICE), taille_police)
    # Calque large pour ne rien tronquer avant le recadrage.
    calque = Image.new("RGBA", (taille_police * 3, taille_police * 3), TRANSPARENT)
    dessin = ImageDraw.Draw(calque)
    dessin.text((taille_police, taille_police), TEXTE, font=police, fill=BLANC)
    return calque.crop(calque.getbbox())


def coller_centre(fond: Image.Image, logo: Image.Image, ratio: float) -> Image.Image:
    """Centre le logotype sur le fond, dimensionné à `ratio` du côté."""
    cible = int(TAILLE * ratio)
    facteur = cible / max(logo.width, logo.height)
    logo = logo.resize(
        (round(logo.width * facteur), round(logo.height * facteur)),
        Image.LANCZOS,
    )
    pos = ((TAILLE - logo.width) // 2, (TAILLE - logo.height) // 2)
    fond.alpha_composite(logo, pos)
    return fond


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    logo = rendre_logotype(560)

    # Icône plein cadre : logotype occupant ~58 % du côté sur le fond du thème.
    icone = coller_centre(Image.new("RGBA", (TAILLE, TAILLE), FOND), logo, 0.58)
    icone.save(ASSETS / "icon.png")

    # Icône adaptative Android : premier plan transparent, logotype réduit
    # (~42 %) pour rester dans la zone de sécurité du masque circulaire.
    adaptive = coller_centre(
        Image.new("RGBA", (TAILLE, TAILLE), TRANSPARENT), logo, 0.42
    )
    adaptive.save(ASSETS / "adaptive-icon.png")

    # Splash : logotype seul, fond transparent (la couleur vient d'app.json).
    splash = coller_centre(
        Image.new("RGBA", (TAILLE, TAILLE), TRANSPARENT), logo, 0.34
    )
    splash.save(ASSETS / "splash-icon.png")

    print("Icônes générées dans", ASSETS)


if __name__ == "__main__":
    main()
