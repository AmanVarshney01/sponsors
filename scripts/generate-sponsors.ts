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
        marginBottom: rowIndex < rows.length - 1 ? '15px' : '0px',
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
                  backgroundColor: '#f3f4f6',
                  padding: '2px', // Add small padding to prevent tight spacing
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
                  marginTop: '6px',
                  fontSize: '11px',
                  color: '#6b7280',
                  textAlign: 'center',
                  maxWidth: `${size + 10}px`,
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
        marginBottom: '30px',
        width: '100%',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontSize: '18px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '15px',
              textAlign: 'center',
            },
            children: label,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px',
            },
            children: rowElements,
          },
        },
      ],
    },
  };
}

function calculateSectionHeight(sponsors: UISponsor[], avatarSize: number, showNames: boolean): number {
  if (sponsors.length === 0) return 0;
  
  const maxPerRow = Math.floor(760 / (avatarSize + 20)); // Match the original layout logic
  const rows = Math.ceil(sponsors.length / maxPerRow);
  
  console.log(`Section with ${sponsors.length} sponsors (${avatarSize}px): ${rows} rows, ${maxPerRow} per row`);
  
  const labelHeight = 18 + 15; // font-size + margin-bottom
  const avatarHeight = avatarSize;
  const nameHeight = showNames ? 6 + 11 + 4 : 6; // margin-top + font-size + extra padding, or minimum spacing for past sponsors
  const singleRowHeight = avatarHeight + nameHeight; // Height of one complete row
  const allRowsHeight = rows * singleRowHeight; // Total height for all rows
  const rowSpacing = Math.max(0, rows - 1) * 15; // 15px spacing between rows
  const sectionMargin = rows > 0 ? 20 : 0; // Only add margin if there are rows, and reduce it
  
  const totalHeight = labelHeight + allRowsHeight + rowSpacing + sectionMargin;
  console.log(`  - Label: ${labelHeight}px, All rows: ${allRowsHeight}px (${rows} × ${singleRowHeight}px), Spacing: ${rowSpacing}px, Margin: ${sectionMargin}px = ${totalHeight}px`);
  
  return totalHeight;
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
    const backers = data.backers || [];
    
    const totalSponsors = specialSponsors.length + currentSponsors.length + pastSponsors.length + backers.length;

    if (totalSponsors === 0) {
      console.log("No sponsors found");
      return;
    }

    console.log(`Generating sponsor banner with Satori for ${totalSponsors} sponsors...`);
    
    // Calculate accurate heights for each section
    const specialHeight = calculateSectionHeight(specialSponsors, 100, true);
    const currentHeight = calculateSectionHeight(currentSponsors, 80, true);
    const backersHeight = calculateSectionHeight(backers, 60, true);
    const pastHeight = calculateSectionHeight(pastSponsors, 60, false);
    
    // Calculate total height dynamically based on actual content
    const containerPadding = 40; // 20px top + 20px bottom
    const bottomPadding = 30; // Reasonable bottom padding
    
    // Calculate total content height more precisely
    let totalContentHeight = 0;
    if (specialSponsors.length > 0) totalContentHeight += specialHeight;
    if (currentSponsors.length > 0) totalContentHeight += currentHeight;
    if (backers.length > 0) totalContentHeight += backersHeight;
    if (pastSponsors.length > 0) totalContentHeight += pastHeight;
    
    const totalHeight = Math.max(200, containerPadding + totalContentHeight + bottomPadding);
    
    console.log(`\nHeight breakdown:`);
    console.log(`  Special: ${specialHeight}px`);
    console.log(`  Current: ${currentHeight}px`);
    console.log(`  Backers: ${backersHeight}px`);
    console.log(`  Past: ${pastHeight}px`);
    console.log(`  Container padding: ${containerPadding}px`);
    console.log(`  Bottom padding: ${bottomPadding}px`);
    console.log(`  Total content height: ${totalContentHeight}px`);
    console.log(`  Total calculated: ${totalHeight}px`);
    
    const sections = [];
    
    if (specialSponsors.length > 0) {
      sections.push(SponsorRow({
        sponsors: specialSponsors,
        size: 100,
        label: 'Special Sponsors',
        color: '#3b82f6'
      }));
    }
    
    if (currentSponsors.length > 0) {
      sections.push(SponsorRow({
        sponsors: currentSponsors,
        size: 80,
        label: 'Sponsors',
        color: '#10b981'
      }));
    }
    
    if (backers.length > 0) {
      sections.push(SponsorRow({
        sponsors: backers,
        size: 60,
        label: 'Backers',
        color: '#f59e0b',
        showNames: true
      }));
    }
    
    if (pastSponsors.length > 0) {
      sections.push(SponsorRow({
        sponsors: pastSponsors,
        size: 40,
        label: 'Past Sponsors',
        color: '#6b7280',
        showNames: false
      }));
    }

    // Remove margin from the last section
    if (sections.length > 0) {
      const lastSection = sections[sections.length - 1];
      lastSection!.props.style.marginBottom = '0px';
    }

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
          padding: '25px', // Balanced padding
          fontFamily: 'Inter, system-ui, sans-serif',
          boxSizing: 'border-box',
        },
        children: sections,
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

    // Calculate row counts for logging using the same logic as the layout
    const calculateRows = (sponsorCount: number, avatarSize: number) => {
      if (sponsorCount === 0) return 0;
      const maxPerRow = Math.floor(760 / (avatarSize + 20)); // Same as original layout logic
      return Math.ceil(sponsorCount / maxPerRow);
    };

    const specialRows = calculateRows(specialSponsors.length, 100);
    const currentRows = calculateRows(currentSponsors.length, 80);
    const backersRows = calculateRows(backers.length, 60);
    const pastRows = calculateRows(pastSponsors.length, 40);

    console.log(`Generated sponsor banner with Satori: ${OUTPUT_SVG}`);
    console.log(`   • Dimensions: 800x${totalHeight}px`);
    console.log(`   • Special sponsors: ${specialSponsors.length} (100px avatars)`);
    console.log(`   • Current sponsors: ${currentSponsors.length} (80px avatars)`);
    console.log(`   • Backers: ${backers.length} (60px avatars)`);
    console.log(`   • Past sponsors: ${pastSponsors.length} (40px avatars)`);
    console.log(`   • Total rows: ${specialRows + currentRows + backersRows + pastRows}`);

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