#!/usr/bin/env bun

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import satori from "satori";
import type { ProcessedSponsor, SponsorsData } from "../lib/types.js";

const SOURCE_DIR: string = process.cwd();
const SPONSORS_JSON: string = join(SOURCE_DIR, "generated", "sponsors.json");
const OUTPUT_SVG: string = join(SOURCE_DIR, "generated", "sponsors.svg");

const FONT_PATH = join(SOURCE_DIR, "fonts", "Inter-Regular.ttf");

interface UISponsor {
  name: string;
  githubId: string;
  avatarUrl: string;
  websiteUrl: string | null;
  githubUrl: string;
  tierName: string;
  totalProcessedAmount: number;
  sinceWhen: string;
  transactionCount: number;
  formattedAmount: string;
}

interface SponsorRowProps {
  sponsors: UISponsor[];
  size: number;
  label: string;
  color: string;
  showNames?: boolean;
}

function SponsorRow({ sponsors, size, label, color, showNames = true }: SponsorRowProps) {
  const maxPerRow = Math.floor(760 / (size + 20));
  const rows = [];
  
  for (let i = 0; i < sponsors.length; i += maxPerRow) {
    rows.push(sponsors.slice(i, i + maxPerRow));
  }

  const rowElements = rows.map((row, rowIndex) => ({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: rowIndex < rows.length - 1 ? '20px' : '0px',
        gap: '20px',
      },
      children: row.map((sponsor) => ({
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                children: {
                  type: 'img',
                  props: {
                    src: sponsor.avatarUrl,
                    width: size,
                    height: size,
                    style: {
                      objectFit: 'cover',
                      borderRadius: '50%',
                    },
                  },
                },
              },
            },
            ...(showNames ? [{
              type: 'div',
              props: {
                style: {
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#6b7280',
                  textAlign: 'center',
                  maxWidth: `${size + 20}px`,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
                children: sponsor.name,
              },
            }] : []),
          ],
        },
      })),
    },
  }));

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '40px',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '20px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '20px',
            },
            children: label,
          },
        },
        ...rowElements,
      ],
    },
  };
}

async function generateSponsors(): Promise<void> {
  if (!existsSync(SPONSORS_JSON)) {
    console.error(`Error: ${SPONSORS_JSON} does not exist.`);
    console.log("Please run the sponsor processor first to generate sponsors.json");
    process.exit(1);
  }

  let fontData: ArrayBuffer | undefined;
  if (existsSync(FONT_PATH)) {
    fontData = await Bun.file(FONT_PATH).arrayBuffer();
  } else {
    console.warn("Font file not found. Using system font. For better results:");
    console.warn("   1. Download Inter font from: https://github.com/googlefonts/inter/raw/main/fonts/ttf/Inter-Regular.ttf");
    console.warn("   2. Create fonts/ directory and place Inter-Regular.ttf there");
  }

  try {
    const data: any = await Bun.file(SPONSORS_JSON).json();
    
    const specialSponsors = data.specialSponsors || [];
    const currentSponsors = data.sponsors || [];
    const pastSponsors = data.pastSponsors || [];
    
    const totalSponsors = specialSponsors.length + currentSponsors.length + pastSponsors.length;

    if (totalSponsors === 0) {
      console.log("No sponsors found");
      return;
    }

    console.log(`Generating sponsor banner with Satori for ${totalSponsors} sponsors...`);
    const specialRows = Math.ceil(specialSponsors.length / Math.floor(760 / 100));
    const currentRows = Math.ceil(currentSponsors.length / Math.floor(760 / 80));
    const pastRows = Math.ceil(pastSponsors.length / Math.floor(760 / 60));
    
    const baseHeight = 40;
    const specialHeight = specialSponsors.length > 0 ? 50 + (specialRows * 120) + 40 : 0;
    const currentHeight = currentSponsors.length > 0 ? 50 + (currentRows * 100) + 40 : 0;
    const pastHeight = pastSponsors.length > 0 ? 50 + (pastRows * 60) + 40 : 0;
    
    const totalHeight = baseHeight + specialHeight + currentHeight + pastHeight;
    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '800px',
          height: `${totalHeight}px`,
          backgroundColor: 'transparent',
          padding: '20px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        children: [
          ...(specialSponsors.length > 0 ? [SponsorRow({
            sponsors: specialSponsors,
            size: 80,
            label: 'Special Sponsors',
            color: '#3b82f6'
          })] : []),
          ...(currentSponsors.length > 0 ? [SponsorRow({
            sponsors: currentSponsors,
            size: 60,
            label: 'Sponsors',
            color: '#10b981'
          })] : []),
          ...(pastSponsors.length > 0 ? [SponsorRow({
            sponsors: pastSponsors,
            size: 40,
            label: 'Past Sponsors',
            color: '#6b7280',
            showNames: false
          })] : []),
        ],
      },
    };

    const svg = await satori(element as any, {
      width: 800,
      height: totalHeight,
      fonts: fontData ? [
        {
          name: 'Inter',
          data: fontData,
          weight: 400,
          style: 'normal',
        },
      ] : [],
    });

    mkdirSync(dirname(OUTPUT_SVG), { recursive: true });
    writeFileSync(OUTPUT_SVG, svg);

    console.log(`Generated sponsor banner with Satori: ${OUTPUT_SVG}`);
    console.log(`   • Dimensions: 800x${totalHeight}px`);
    console.log(`   • Special sponsors: ${specialSponsors.length} (80px avatars)`);
    console.log(`   • Current sponsors: ${currentSponsors.length} (60px avatars)`);
    console.log(`   • Past sponsors: ${pastSponsors.length} (40px avatars)`);
    console.log(`   • Total rows: ${specialRows + currentRows + pastRows}`);

  } catch (error) {
    console.error("Error generating sponsor banner:", error);
    
    if (error instanceof Error && error.message.includes('Cannot resolve module')) {
      console.log("\nTo use this improved version, install Satori:");
      console.log("   bun add satori");
      console.log("\nYou'll also need a font file for better rendering:");
      console.log("   mkdir fonts");
      console.log("   curl -o fonts/Inter-Regular.ttf https://github.com/googlefonts/inter/raw/main/fonts/ttf/Inter-Regular.ttf");
    }
    
    process.exit(1);
  }
}

generateSponsors().catch((error) => {
	console.error("Unexpected error:", error);
	process.exit(1);
});
