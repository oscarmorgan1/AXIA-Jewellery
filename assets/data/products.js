/* ============================================================
   AXIA, PUBLIC PRODUCT CATALOGUE (offline fallback)
   The live catalogue is the Firestore "products" collection, edited in
   the admin portal (/admin). Browsers get it from GET /api/catalogue;
   this file is only used if that can't be reached.
   Written by `npm run export:products`: do not edit by hand.
   PUBLIC VIEW ONLY (server/public-catalogue.js): live pieces with their
   retail prices, Coming soon pieces as teasers with no prices or
   description. The full catalogue (the seed source) is
   scripts/data/catalogue.json, which is never served.
   ============================================================ */
window.AXIA_PRODUCTS = [
  {
    "id": "cross-pendant",
    "name": "Multicolour Moissanite Cross Pendant",
    "width": null,
    "cat": "pendant",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "pendants"
    ],
    "art": "cross",
    "desc": "A cross set in multicoloured gems, surrounded by hand-set VVS D-colour moissanite in 925 sterling silver. Wear it on its own or over a tennis chain. The moissanite passes a diamond tester and comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/cross-pendant/1.jpg",
      "assets/img/products/cross-pendant/2.jpg"
    ],
    "stone": "Multicolour moissanite",
    "variants": [
      {
        "length": null,
        "priceAUD": 399
      }
    ],
    "fromPriceAUD": 399,
    "singlePrice": true
  },
  {
    "id": "cross-set",
    "name": "The Cross Set",
    "width": null,
    "cat": "pendant",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": "First Drop",
    "mto": false,
    "coll": [
      "sets",
      "pendants"
    ],
    "art": "cross",
    "desc": "The multicoloured cross on the 4mm tennis chain it hangs on, hand-set VVS D-colour moissanite in 925 sterling silver. Bought as a set, A$149 less than the pendant and chain on their own. Passes a diamond tester and comes with a GRA certificate of authentication.",
    "stone": "Multicolour moissanite",
    "bundle": [
      "Multicolour Moissanite Cross Pendant",
      "Classic Tennis Chain, 4mm · 20\""
    ],
    "bundleOf": [
      "cross-pendant",
      "tennis-chain"
    ],
    "images": [
      "assets/img/products/cross-set/1.jpg",
      "assets/img/products/cross-set/2.jpg"
    ],
    "variants": [
      {
        "length": null,
        "priceAUD": 699
      }
    ],
    "fromPriceAUD": 699,
    "singlePrice": true,
    "compareAtAUD": 848
  },
  {
    "hidden": true,
    "id": "tennis-set",
    "name": "The Tennis Set",
    "width": null,
    "cat": "chain",
    "cons": null,
    "level": 2,
    "col": [
      "Silver"
    ],
    "badge": "Matching set",
    "mto": false,
    "coll": [
      "sets",
      "tennis"
    ],
    "art": "tennis",
    "images": [
      "assets/img/products/tennis-chain-4mm/1.jpg",
      "assets/img/products/tennis-bracelet-4mm/1.jpg"
    ],
    "singlePrice": false,
    "defaultLength": "8\"",
    "desc": "",
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "prong-set",
    "name": "The Moonrock Set",
    "width": null,
    "cat": "chain",
    "cons": "prong",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": "Matching set",
    "mto": false,
    "coll": [
      "sets",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/prong-cuban-bracelet-10mm/silver/1.jpg",
      "assets/img/products/single-row-prong-cuban-chain-10mm/1.jpg"
    ],
    "singlePrice": false,
    "defaultLength": "7.5\"",
    "desc": "",
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "classic-cuban-set",
    "name": "The Classic Cuban Set",
    "width": null,
    "cat": "chain",
    "cons": "classic",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": "Matching set",
    "mto": false,
    "coll": [
      "sets",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/two-row-flat-cuban-bracelet-12mm/1.jpg",
      "assets/img/products/two-row-flat-cuban-chain-12mm/silver/1.jpg"
    ],
    "singlePrice": false,
    "defaultLength": "8\"",
    "desc": "",
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "fire-bezel-set",
    "name": "The Fire Bezel Set",
    "width": null,
    "cat": "chain",
    "cons": "fire-bezel",
    "level": 4,
    "col": [
      "Silver"
    ],
    "badge": "Matching set",
    "mto": false,
    "coll": [
      "sets",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/fire-bezel-cuban-chain-15mm/1.jpg",
      "assets/img/products/fire-bezel-cuban-bracelet-15mm/silver/1.jpg"
    ],
    "singlePrice": false,
    "defaultLength": "8\"",
    "desc": "",
    "variants": [
      {
        "length": "7.5\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "micro-pave-set",
    "name": "The Micro Pavé Set",
    "width": null,
    "cat": "chain",
    "cons": "micro-pave",
    "level": 4,
    "col": [
      "Silver"
    ],
    "badge": "Matching set",
    "mto": false,
    "coll": [
      "sets",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/micro-pave-cuban-chain-15mm/1.jpg",
      "assets/img/products/micro-pave-cuban-bracelet-15mm/1.jpg"
    ],
    "singlePrice": false,
    "defaultLength": "7.5\"",
    "desc": "",
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "id": "tennis-chain",
    "name": "Classic Tennis Chain",
    "width": "2-5mm",
    "cat": "chain",
    "cons": null,
    "level": 2,
    "col": [
      "Silver"
    ],
    "badge": "All widths",
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "desc": "A single row of VVS D-colour moissanite, hand-set edge to edge in 925 sterling silver. Pick your width, 2mm to 5mm, and your length. Every stone passes a diamond tester and comes with a GRA certificate of authentication.",
    "sizingImage": "assets/img/products/tennis-chain-sizing.jpg",
    "images": [
      "assets/img/products/tennis-chain-sizing.jpg"
    ],
    "defaultWidth": "4mm",
    "widths": [
      {
        "width": "2mm",
        "image": "assets/img/products/tennis-chain-2mm/1.jpg",
        "fromPriceAUD": 299,
        "variants": [
          {
            "length": "16\"",
            "priceAUD": 299
          },
          {
            "length": "18\"",
            "priceAUD": 329
          },
          {
            "length": "20\"",
            "priceAUD": 349
          },
          {
            "length": "22\"",
            "priceAUD": 379
          },
          {
            "length": "24\"",
            "priceAUD": 399
          },
          {
            "length": "26\"",
            "priceAUD": 429
          }
        ]
      },
      {
        "width": "3mm",
        "image": "assets/img/products/tennis-chain-3mm/1.jpg",
        "fromPriceAUD": 379,
        "variants": [
          {
            "length": "16\"",
            "priceAUD": 379
          },
          {
            "length": "18\"",
            "priceAUD": 419
          },
          {
            "length": "20\"",
            "priceAUD": 449
          },
          {
            "length": "22\"",
            "priceAUD": 479
          },
          {
            "length": "24\"",
            "priceAUD": 529
          },
          {
            "length": "26\"",
            "priceAUD": 559
          }
        ]
      },
      {
        "width": "4mm",
        "image": "assets/img/products/tennis-chain-4mm/1.jpg",
        "fromPriceAUD": 449,
        "variants": [
          {
            "length": "16\"",
            "priceAUD": 449
          },
          {
            "length": "18\"",
            "priceAUD": 479
          },
          {
            "length": "20\"",
            "priceAUD": 499
          },
          {
            "length": "22\"",
            "priceAUD": 529
          },
          {
            "length": "24\"",
            "priceAUD": 579
          },
          {
            "length": "26\"",
            "priceAUD": 629
          }
        ]
      },
      {
        "width": "5mm",
        "image": "assets/img/products/tennis-chain-5mm/1.jpg",
        "fromPriceAUD": 549,
        "variants": [
          {
            "length": "16\"",
            "priceAUD": 549
          },
          {
            "length": "18\"",
            "priceAUD": 599
          },
          {
            "length": "20\"",
            "priceAUD": 649
          },
          {
            "length": "22\"",
            "priceAUD": 679
          },
          {
            "length": "24\"",
            "priceAUD": 699
          },
          {
            "length": "26\"",
            "priceAUD": 749
          }
        ]
      }
    ],
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 449
      },
      {
        "length": "18\"",
        "priceAUD": 479
      },
      {
        "length": "20\"",
        "priceAUD": 499
      },
      {
        "length": "22\"",
        "priceAUD": 529
      },
      {
        "length": "24\"",
        "priceAUD": 579
      },
      {
        "length": "26\"",
        "priceAUD": 629
      }
    ],
    "fromPriceAUD": 299,
    "singlePrice": false
  },
  {
    "hidden": true,
    "id": "tennis-chain-2mm",
    "name": "Classic Tennis Chain",
    "width": "2mm",
    "cat": "chain",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "images": [
      "assets/img/products/tennis-chain-2mm/1.jpg",
      "assets/img/products/tennis-chain-sizing.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "tennis-chain-3mm",
    "name": "Classic Tennis Chain",
    "width": "3mm",
    "cat": "chain",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "images": [
      "assets/img/products/tennis-chain-3mm/1.jpg",
      "assets/img/products/tennis-chain-sizing.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "id": "tennis-chain-4mm",
    "linkTo": "product.html?id=tennis-chain",
    "name": "Classic Tennis Chain",
    "width": "4mm",
    "cat": "chain",
    "cons": null,
    "level": 2,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "desc": "The 4mm tennis chain. Enough weight to notice, clean enough to wear under a collar.",
    "images": [
      "assets/img/products/tennis-chain-4mm/1.jpg",
      "assets/img/products/tennis-chain-sizing.jpg"
    ],
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 449
      },
      {
        "length": "18\"",
        "priceAUD": 479
      },
      {
        "length": "20\"",
        "priceAUD": 499
      },
      {
        "length": "22\"",
        "priceAUD": 529
      },
      {
        "length": "24\"",
        "priceAUD": 579
      },
      {
        "length": "26\"",
        "priceAUD": 629
      }
    ],
    "fromPriceAUD": 449,
    "singlePrice": false
  },
  {
    "hidden": true,
    "id": "tennis-chain-5mm",
    "name": "Classic Tennis Chain",
    "width": "5mm",
    "cat": "chain",
    "cons": null,
    "level": 2,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "images": [
      "assets/img/products/tennis-chain-5mm/1.jpg",
      "assets/img/products/tennis-chain-sizing.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "id": "tennis-bracelet",
    "name": "Classic Tennis Bracelet",
    "width": "2-5mm",
    "cat": "bracelet",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "desc": "A single row of VVS D-colour moissanite for the wrist, hand-set edge to edge in 925 sterling silver. Pick your width, 2mm to 5mm, and your size. Every stone passes a diamond tester and comes with a GRA certificate of authentication.",
    "sizingImage": "assets/img/products/tennis-bracelet-sizing.jpg",
    "images": [
      "assets/img/products/tennis-bracelet-4mm/1.jpg"
    ],
    "defaultWidth": "4mm",
    "widths": [
      {
        "width": "2mm",
        "image": "assets/img/products/tennis-bracelet-2mm/1.jpg",
        "fromPriceAUD": 129,
        "variants": [
          {
            "length": "6\"",
            "priceAUD": 129
          },
          {
            "length": "7\"",
            "priceAUD": 139
          },
          {
            "length": "7.5\"",
            "priceAUD": 149
          },
          {
            "length": "8\"",
            "priceAUD": 159
          },
          {
            "length": "8.5\"",
            "priceAUD": 169
          },
          {
            "length": "9\"",
            "priceAUD": 179
          }
        ]
      },
      {
        "width": "3mm",
        "image": "assets/img/products/tennis-bracelet-3mm/1.jpg",
        "fromPriceAUD": 159,
        "variants": [
          {
            "length": "6\"",
            "priceAUD": 159
          },
          {
            "length": "7\"",
            "priceAUD": 179
          },
          {
            "length": "7.5\"",
            "priceAUD": 189
          },
          {
            "length": "8\"",
            "priceAUD": 199
          },
          {
            "length": "8.5\"",
            "priceAUD": 219
          },
          {
            "length": "9\"",
            "priceAUD": 229
          }
        ]
      },
      {
        "width": "4mm",
        "image": "assets/img/products/tennis-bracelet-4mm/1.jpg",
        "fromPriceAUD": 199,
        "variants": [
          {
            "length": "6\"",
            "priceAUD": 199
          },
          {
            "length": "7\"",
            "priceAUD": 219
          },
          {
            "length": "7.5\"",
            "priceAUD": 229
          },
          {
            "length": "8\"",
            "priceAUD": 239
          },
          {
            "length": "8.5\"",
            "priceAUD": 259
          },
          {
            "length": "9\"",
            "priceAUD": 279
          }
        ]
      },
      {
        "width": "5mm",
        "image": "assets/img/products/tennis-bracelet-5mm/1.jpg",
        "fromPriceAUD": 219,
        "variants": [
          {
            "length": "6\"",
            "priceAUD": 219
          },
          {
            "length": "7\"",
            "priceAUD": 239
          },
          {
            "length": "7.5\"",
            "priceAUD": 259
          },
          {
            "length": "8\"",
            "priceAUD": 279
          },
          {
            "length": "8.5\"",
            "priceAUD": 289
          },
          {
            "length": "9\"",
            "priceAUD": 299
          }
        ]
      }
    ],
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 199
      },
      {
        "length": "7\"",
        "priceAUD": 219
      },
      {
        "length": "7.5\"",
        "priceAUD": 229
      },
      {
        "length": "8\"",
        "priceAUD": 239
      },
      {
        "length": "8.5\"",
        "priceAUD": 259
      },
      {
        "length": "9\"",
        "priceAUD": 279
      }
    ],
    "fromPriceAUD": 129,
    "singlePrice": false
  },
  {
    "hidden": true,
    "id": "tennis-bracelet-2mm",
    "name": "Classic Tennis Bracelet",
    "width": "2mm",
    "cat": "bracelet",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "tennis-bracelet-3mm",
    "name": "Classic Tennis Bracelet",
    "width": "3mm",
    "cat": "bracelet",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "tennis-bracelet-4mm",
    "name": "Classic Tennis Bracelet",
    "width": "4mm",
    "cat": "bracelet",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "tennis-bracelet-5mm",
    "name": "Classic Tennis Bracelet",
    "width": "5mm",
    "cat": "bracelet",
    "cons": null,
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "id": "square-halo-tennis-bracelet",
    "name": "Square Halo Tennis Bracelet",
    "width": "8mm",
    "cat": "bracelet",
    "cons": null,
    "level": 2,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "tennis"
    ],
    "art": "tennis",
    "desc": "Each stone is framed in a square halo setting of smaller stones, so every link reads as its own cluster of light. A full 8mm of hand-set VVS D-colour moissanite in 925 sterling silver. Every stone passes a diamond tester and comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/square-halo-tennis-bracelet/1.jpg",
      "assets/img/products/square-halo-tennis-bracelet/2.jpg",
      "assets/img/products/square-halo-tennis-bracelet/3.jpg",
      "assets/img/products/square-halo-tennis-bracelet/4.jpg",
      "assets/img/products/square-halo-tennis-bracelet/5.jpg"
    ],
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 499
      },
      {
        "length": "7\"",
        "priceAUD": 529
      },
      {
        "length": "7.5\"",
        "priceAUD": 549
      },
      {
        "length": "8\"",
        "priceAUD": 569
      }
    ],
    "fromPriceAUD": 499,
    "singlePrice": false
  },
  {
    "id": "classic-cuban-bracelet-10mm",
    "name": "Iced Cuban Bracelet",
    "width": "10mm",
    "cat": "bracelet",
    "cons": "classic",
    "level": 2,
    "col": [
      "Silver",
      "Gold",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "classic-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "desc": "A solid 10mm iced Cuban, clean and heavy enough to wear on its own every day. Hand-set VVS D-colour moissanite in 925 sterling silver. Every stone passes a diamond tester and comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/classic-cuban-bracelet-10mm/silver/1.jpg",
      "assets/img/products/classic-cuban-bracelet-10mm/silver/2.jpg",
      "assets/img/products/classic-cuban-bracelet-10mm/silver/3.jpg",
      "assets/img/products/classic-cuban-bracelet-10mm/silver/4.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/classic-cuban-bracelet-10mm/silver/1.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/silver/2.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/silver/3.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/silver/4.jpg"
      ],
      "Gold": [
        "assets/img/products/classic-cuban-bracelet-10mm/gold/1.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/gold/2.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/gold/3.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/gold/4.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/classic-cuban-bracelet-10mm/rosegold/1.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/rosegold/2.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/rosegold/3.jpg",
        "assets/img/products/classic-cuban-bracelet-10mm/rosegold/4.jpg"
      ]
    },
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 699
      },
      {
        "length": "7\"",
        "priceAUD": 749
      },
      {
        "length": "7.5\"",
        "priceAUD": 799
      },
      {
        "length": "8\"",
        "priceAUD": 849
      },
      {
        "length": "8.5\"",
        "priceAUD": 899
      }
    ],
    "fromPriceAUD": 699,
    "singlePrice": false
  },
  {
    "id": "iced-cuban-bracelet-5mm",
    "name": "Iced Cuban Bracelet",
    "width": "5mm",
    "cat": "bracelet",
    "cons": "classic",
    "level": 1,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "cuban"
    ],
    "art": "cubanBracelet",
    "desc": "The most subtle Cuban we make. 5mm, fully iced, light enough for every day and easy to stack. Hand-set VVS D-colour moissanite in 925 sterling silver, every stone passing a diamond tester. Comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/iced-cuban-bracelet-5mm/1.jpg",
      "assets/img/products/iced-cuban-bracelet-5mm/2.jpg"
    ],
    "video": "assets/img/products/iced-cuban-bracelet-5mm/video.mp4",
    "videoPoster": "assets/img/products/iced-cuban-bracelet-5mm/poster.jpg",
    "variants": [
      {
        "length": "6\"",
        "priceAUD": 199
      },
      {
        "length": "6.5\"",
        "priceAUD": 209
      },
      {
        "length": "7\"",
        "priceAUD": 229
      },
      {
        "length": "7.5\"",
        "priceAUD": 239
      },
      {
        "length": "8\"",
        "priceAUD": 259
      },
      {
        "length": "8.5\"",
        "priceAUD": 269
      }
    ],
    "fromPriceAUD": 199,
    "singlePrice": false
  },
  {
    "hidden": true,
    "id": "classic-cuban-bracelet-15mm",
    "name": "Iced Cuban Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": "classic",
    "level": 3,
    "col": [
      "Silver",
      "Gold",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "classic-cuban",
      "cuban",
      "15mm-cuban"
    ],
    "art": "cubanBracelet",
    "images": [
      "assets/img/products/classic-cuban-bracelet-15mm/silver/1.jpg",
      "assets/img/products/classic-cuban-bracelet-15mm/silver/2.jpg",
      "assets/img/products/classic-cuban-bracelet-15mm/silver/3.jpg",
      "assets/img/products/classic-cuban-bracelet-15mm/silver/4.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/classic-cuban-bracelet-15mm/silver/1.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/silver/2.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/silver/3.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/silver/4.jpg"
      ],
      "Gold": [
        "assets/img/products/classic-cuban-bracelet-15mm/gold/1.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/gold/2.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/gold/3.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/gold/4.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/classic-cuban-bracelet-15mm/rosegold/1.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/rosegold/2.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/rosegold/3.jpg",
        "assets/img/products/classic-cuban-bracelet-15mm/rosegold/4.jpg"
      ]
    },
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "id": "prong-cuban-bracelet-10mm",
    "name": "Moonrock Cuban Bracelet",
    "width": "10mm",
    "cat": "bracelet",
    "cons": "prong",
    "level": 2,
    "col": [
      "Silver",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "prong-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "desc": "A 10mm Moonrock Cuban. The stones sit raised in prong settings, so it throws light from more angles than a flat set. Hand-set VVS D-colour moissanite in 925 sterling silver, every stone passing a diamond tester. Comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/prong-cuban-bracelet-10mm/silver/1.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/prong-cuban-bracelet-10mm/silver/1.jpg",
        "assets/img/products/prong-cuban-bracelet-10mm/silver/2.jpg",
        "assets/img/products/prong-cuban-bracelet-10mm/both.jpg",
        "assets/img/products/prong-cuban-bracelet-10mm/sizing.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/prong-cuban-bracelet-10mm/rosegold/1.jpg",
        "assets/img/products/prong-cuban-bracelet-10mm/rosegold/2.jpg",
        "assets/img/products/prong-cuban-bracelet-10mm/both.jpg",
        "assets/img/products/prong-cuban-bracelet-10mm/sizing.jpg"
      ]
    },
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 799
      },
      {
        "length": "7.5\"",
        "priceAUD": 849
      },
      {
        "length": "8\"",
        "priceAUD": 899
      }
    ],
    "fromPriceAUD": 799,
    "singlePrice": false
  },
  {
    "hidden": true,
    "id": "prong-cuban-bracelet-15mm",
    "name": "Moonrock Cuban Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": "prong",
    "level": 3,
    "col": [
      "Silver",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "prong-cuban",
      "cuban",
      "15mm-cuban"
    ],
    "art": "cubanBracelet",
    "images": [
      "assets/img/products/prong-cuban-bracelet-15mm/silver/1.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/prong-cuban-bracelet-15mm/silver/1.jpg",
        "assets/img/products/prong-cuban-bracelet-15mm/silver/2.jpg",
        "assets/img/products/prong-cuban-bracelet-15mm/silver/3.jpg",
        "assets/img/products/prong-cuban-bracelet-15mm/sizing.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/prong-cuban-bracelet-15mm/rosegold/1.jpg",
        "assets/img/products/prong-cuban-bracelet-15mm/rosegold/2.jpg",
        "assets/img/products/prong-cuban-bracelet-15mm/sizing.jpg"
      ]
    },
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "prong-cuban-bracelet-16mm",
    "name": "Moonrock Cuban Bracelet",
    "width": "16mm",
    "cat": "bracelet",
    "cons": "prong",
    "level": 3,
    "col": [
      "Silver",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "prong-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "images": [
      "assets/img/products/prong-cuban-bracelet-16mm/silver/1.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/prong-cuban-bracelet-16mm/silver/1.jpg",
        "assets/img/products/prong-cuban-bracelet-16mm/silver/2.jpg",
        "assets/img/products/prong-cuban-bracelet-16mm/silver/3.jpg",
        "assets/img/products/prong-cuban-bracelet-16mm/sizing.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/prong-cuban-bracelet-16mm/rosegold/1.jpg",
        "assets/img/products/prong-cuban-bracelet-16mm/rosegold/2.jpg",
        "assets/img/products/prong-cuban-bracelet-16mm/sizing.jpg"
      ]
    },
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "single-row-prong-cuban-chain-10mm",
    "name": "Moonrock Cuban Chain",
    "width": "10mm",
    "cat": "chain",
    "cons": "prong",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "prong-cuban",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/single-row-prong-cuban-chain-10mm/1.jpg",
      "assets/img/products/single-row-prong-cuban-chain-10mm/2.jpg",
      "assets/img/products/single-row-prong-cuban-chain-10mm/3.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "prong-cuban-chain-16mm",
    "name": "Moonrock Cuban Chain",
    "width": "16mm",
    "cat": "chain",
    "cons": "prong",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "prong-cuban",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/prong-cuban-chain-16mm/1.jpg",
      "assets/img/products/prong-cuban-chain-16mm/2.jpg",
      "assets/img/products/prong-cuban-chain-16mm/3.jpg",
      "assets/img/products/prong-cuban-chain-16mm/4.jpg",
      "assets/img/products/prong-cuban-chain-16mm/5.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "id": "floral-bracelet-15mm",
    "name": "Lucky Clover Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": null,
    "level": 3,
    "col": [
      "Silver & Blue",
      "Pink & Rose Gold"
    ],
    "badge": "Feeling lucky?",
    "mto": false,
    "coll": [
      "flower",
      "cuban"
    ],
    "art": "cubanBracelet",
    "stone": "Coloured moissanite",
    "desc": "A lucky four-leaf clover, fully iced in hand-set coloured moissanite in 925 sterling silver. Two colourways, and on a lucky-number promo for the First Drop: 777, 888, 999. Passes a diamond tester and comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/floral-bracelet-15mm/silver-blue/2.jpg",
      "assets/img/products/floral-bracelet-15mm/silver-blue/3.jpg"
    ],
    "imagesByColor": {
      "Silver & Blue": [
        "assets/img/products/floral-bracelet-15mm/silver-blue/1.jpg",
        "assets/img/products/floral-bracelet-15mm/silver-blue/2.jpg",
        "assets/img/products/floral-bracelet-15mm/group.jpg",
        "assets/img/products/floral-bracelet-15mm/silver-blue/3.jpg"
      ],
      "Pink & Rose Gold": [
        "assets/img/products/floral-bracelet-15mm/pink-rosegold/1.jpg",
        "assets/img/products/floral-bracelet-15mm/pink-rosegold/2.jpg",
        "assets/img/products/floral-bracelet-15mm/group.jpg",
        "assets/img/products/floral-bracelet-15mm/pink-rosegold/3.jpg"
      ]
    },
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 777
      },
      {
        "length": "7.5\"",
        "priceAUD": 888
      },
      {
        "length": "8\"",
        "priceAUD": 999
      }
    ],
    "fromPriceAUD": 777,
    "defaultLength": "7\"",
    "singlePrice": false
  },
  {
    "id": "two-row-flat-cuban-bracelet-12mm",
    "colourToCloseup": true,
    "name": "Iced Cuban Bracelet",
    "width": "12mm",
    "cat": "bracelet",
    "cons": "classic",
    "level": 2,
    "col": [
      "Silver",
      "Gold",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "12mm-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "desc": "Two rows of moissanite on each link, a classic 12mm Cuban you can't go wrong with. Hand-set VVS D-colour moissanite in 925 sterling silver, every stone passing a diamond tester. Comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/two-row-flat-cuban-bracelet-12mm/1.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/1.jpg",
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/2.jpg",
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/silver/4.jpg"
      ],
      "Gold": [
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/1.jpg",
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/2.jpg",
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/gold/4.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/1.jpg",
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/2.jpg",
        "assets/img/products/two-row-flat-cuban-bracelet-12mm/rosegold/4.jpg"
      ]
    },
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 749
      },
      {
        "length": "7\"",
        "priceAUD": 799
      },
      {
        "length": "7.5\"",
        "priceAUD": 849
      },
      {
        "length": "8\"",
        "priceAUD": 899
      },
      {
        "length": "8.5\"",
        "priceAUD": 949
      },
      {
        "length": "9\"",
        "priceAUD": 999
      }
    ],
    "fromPriceAUD": 749,
    "singlePrice": false
  },
  {
    "id": "two-row-flat-cuban-chain-12mm",
    "name": "Iced Cuban Chain",
    "width": "12mm",
    "cat": "chain",
    "cons": "classic",
    "level": 3,
    "col": [
      "Silver",
      "Gold",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "12mm-cuban",
      "cuban"
    ],
    "art": "cuban",
    "desc": "Two rows of moissanite on each link, running the length of a 12mm Cuban chain. Hand-set VVS D-colour moissanite in 925 sterling silver, every stone passing a diamond tester. Comes with a GRA certificate of authentication.",
    "images": [
      "assets/img/products/two-row-flat-cuban-chain-12mm/silver/1.jpg",
      "assets/img/products/two-row-flat-cuban-chain-12mm/silver/2.jpg",
      "assets/img/products/two-row-flat-cuban-chain-12mm/silver/3.jpg",
      "assets/img/products/two-row-flat-cuban-chain-12mm/silver/4.jpg"
    ],
    "imagesByColor": {
      "Silver": [
        "assets/img/products/two-row-flat-cuban-chain-12mm/silver/1.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/silver/2.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/silver/3.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/silver/4.jpg"
      ],
      "Gold": [
        "assets/img/products/two-row-flat-cuban-chain-12mm/gold/1.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/gold/2.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/gold/3.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/gold/4.jpg"
      ],
      "Rose Gold": [
        "assets/img/products/two-row-flat-cuban-chain-12mm/rosegold/1.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/rosegold/2.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/rosegold/3.jpg",
        "assets/img/products/two-row-flat-cuban-chain-12mm/rosegold/4.jpg"
      ]
    },
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 1699
      },
      {
        "length": "18\"",
        "priceAUD": 1899
      },
      {
        "length": "20\"",
        "priceAUD": 2099
      },
      {
        "length": "22\"",
        "priceAUD": 2299
      },
      {
        "length": "24\"",
        "priceAUD": 2499
      }
    ],
    "fromPriceAUD": 1699,
    "singlePrice": false
  },
  {
    "hidden": true,
    "id": "micro-pave-cuban-bracelet-12mm",
    "name": "Micro Pavé Cuban Bracelet",
    "width": "12mm",
    "cat": "bracelet",
    "cons": "micro-pave",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "12mm-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "micro-pave-cuban-chain-12mm",
    "name": "Micro Pavé Cuban Chain",
    "width": "12mm",
    "cat": "chain",
    "cons": "micro-pave",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "12mm-cuban",
      "cuban"
    ],
    "art": "cuban",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "fire-bezel-cuban-bracelet-15mm",
    "name": "Fire Bezel Cuban Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": "fire-bezel",
    "level": 3,
    "col": [
      "Silver",
      "Rose Gold"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "15mm-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "images": [
      "assets/img/products/fire-bezel-cuban-bracelet-15mm/both.jpg",
      "assets/img/products/fire-bezel-cuban-bracelet-15mm/silver/1.jpg",
      "assets/img/products/fire-bezel-cuban-bracelet-15mm/silver/2.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "7.5\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "fire-bezel-cuban-chain-15mm",
    "name": "Fire Bezel Cuban Chain",
    "width": "15mm",
    "cat": "chain",
    "cons": "fire-bezel",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "15mm-cuban",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/fire-bezel-cuban-chain-15mm/1.jpg",
      "assets/img/products/fire-bezel-cuban-chain-15mm/2.jpg",
      "assets/img/products/fire-bezel-cuban-chain-15mm/3.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "baguette-cuban-bracelet-15mm",
    "name": "Baguette Cuban Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": "baguette",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "15mm-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "cross-link-cuban-bracelet-15mm",
    "name": "Chrome Hearts Inspired Cuban Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": "cross-link",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "15mm-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "images": [
      "assets/img/products/cross-link-cuban-bracelet-15mm/1.jpg",
      "assets/img/products/cross-link-cuban-bracelet-15mm/2.jpg",
      "assets/img/products/cross-link-cuban-bracelet-15mm/3.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "6.5\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "micro-pave-cuban-bracelet-15mm",
    "name": "Micro Pavé Cuban Bracelet",
    "width": "15mm",
    "cat": "bracelet",
    "cons": "micro-pave",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "15mm-cuban",
      "cuban"
    ],
    "art": "cubanBracelet",
    "images": [
      "assets/img/products/micro-pave-cuban-bracelet-15mm/1.jpg",
      "assets/img/products/micro-pave-cuban-bracelet-15mm/2.jpg",
      "assets/img/products/micro-pave-cuban-bracelet-15mm/3.jpg",
      "assets/img/products/micro-pave-cuban-bracelet-15mm/4.jpg"
    ],
    "video": "assets/img/products/micro-pave-cuban-bracelet-15mm/bracelet.mp4",
    "videoPoster": "assets/img/products/micro-pave-cuban-bracelet-15mm/poster.jpg",
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "7\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "micro-pave-cuban-chain-15mm",
    "name": "Micro Pavé Cuban Chain",
    "width": "15mm",
    "cat": "chain",
    "cons": "micro-pave",
    "level": 3,
    "col": [
      "Silver"
    ],
    "badge": null,
    "mto": false,
    "coll": [
      "15mm-cuban",
      "cuban"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/micro-pave-cuban-chain-15mm/1.jpg",
      "assets/img/products/micro-pave-cuban-chain-15mm/2.jpg",
      "assets/img/products/micro-pave-cuban-chain-15mm/3.jpg",
      "assets/img/products/micro-pave-cuban-chain-15mm/4.jpg",
      "assets/img/products/micro-pave-cuban-chain-15mm/5.jpg",
      "assets/img/products/micro-pave-cuban-chain-15mm/6.jpg"
    ],
    "singlePrice": false,
    "desc": "",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "the-titan",
    "name": "THE TITAN",
    "width": "18mm",
    "cat": "chain",
    "cons": "fancy-cut",
    "level": 4,
    "col": [
      "Silver"
    ],
    "badge": "Coming soon",
    "mto": true,
    "coll": [
      "titans"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/the-titan/1.jpg",
      "assets/img/products/the-titan/2.jpg",
      "assets/img/products/the-titan/3.jpg",
      "assets/img/products/the-titan/4.jpg"
    ],
    "linkTo": "titans.html",
    "titan": true,
    "singlePrice": false,
    "desc": "Fancy-cut stones transform the Miami Cuban into a larger study of shape and light. THE TITAN is built for unmistakable scale without losing structural discipline.",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      },
      {
        "length": "20\"",
        "priceAUD": 0
      },
      {
        "length": "22\"",
        "priceAUD": 0
      },
      {
        "length": "24\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "the-emperor",
    "name": "THE EMPEROR",
    "width": "18mm",
    "cat": "chain",
    "cons": "baguette",
    "level": 4,
    "col": [
      "Silver"
    ],
    "badge": "Coming soon",
    "mto": true,
    "coll": [
      "titans"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/the-emperor/1.jpg",
      "assets/img/products/the-emperor/2.jpg",
      "assets/img/products/the-emperor/3.jpg",
      "assets/img/products/the-emperor/4.jpg",
      "assets/img/products/the-emperor/5.jpg"
    ],
    "linkTo": "titans.html",
    "titan": true,
    "singlePrice": false,
    "desc": "Baguette cuts create long, ordered flashes across an 18mm Cuban foundation. THE EMPEROR is architectural, commanding and deliberately formal.",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      },
      {
        "length": "20\"",
        "priceAUD": 0
      },
      {
        "length": "22\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "the-requiem",
    "name": "THE REQUIEM",
    "width": "18mm",
    "cat": "chain",
    "cons": "cross-clasp",
    "level": 4,
    "col": [
      "Silver"
    ],
    "badge": "Coming soon",
    "mto": true,
    "coll": [
      "titans"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/the-requiem/1.jpg",
      "assets/img/products/the-requiem/2.jpg",
      "assets/img/products/the-requiem/3.jpg"
    ],
    "video": "assets/img/products/the-requiem/requiem.mp4",
    "videoPoster": "assets/img/products/the-requiem/poster.jpg",
    "linkTo": "titans.html",
    "titan": true,
    "singlePrice": false,
    "desc": "A cross-defined clasp anchors an 18mm Cuban built around symbolism and weight. THE REQUIEM carries a darker, more ceremonial presence within The Titans.",
    "variants": [
      {
        "length": "18\"",
        "priceAUD": 0
      },
      {
        "length": "20\"",
        "priceAUD": 0
      },
      {
        "length": "22\"",
        "priceAUD": 0
      },
      {
        "length": "24\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  },
  {
    "hidden": true,
    "id": "the-ascendant",
    "name": "THE ASCENDANT",
    "width": "18mm",
    "cat": "chain",
    "cons": "marquise",
    "level": 4,
    "col": [
      "Rose Gold"
    ],
    "badge": "Coming soon",
    "mto": true,
    "coll": [
      "titans"
    ],
    "art": "cuban",
    "images": [
      "assets/img/products/the-ascendant/1.jpg",
      "assets/img/products/the-ascendant/2.jpg",
      "assets/img/products/the-ascendant/3.jpg",
      "assets/img/products/the-ascendant/4.jpg",
      "assets/img/products/the-ascendant/5.jpg",
      "assets/img/products/the-ascendant/6.jpg"
    ],
    "linkTo": "titans.html",
    "titan": true,
    "singlePrice": false,
    "desc": "Marquise-cut stones give AXIA's most ambitious Cuban a rising, pointed rhythm. The apex of the collection, made to order and personalised, built one at a time.",
    "variants": [
      {
        "length": "16\"",
        "priceAUD": 0
      },
      {
        "length": "18\"",
        "priceAUD": 0
      },
      {
        "length": "20\"",
        "priceAUD": 0
      },
      {
        "length": "22\"",
        "priceAUD": 0
      },
      {
        "length": "24\"",
        "priceAUD": 0
      }
    ],
    "fromPriceAUD": 0
  }
];
