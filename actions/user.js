"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// ===============================
// ✅ UPDATE USER (ONBOARDING)
// ===============================
export async function updateUser(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) throw new Error("User not found");

    const industry = data.industry || "";
    const experience = Number(data.experience) || 0;
    const bio = data.bio || "";
    const skills =
      typeof data.skills === "string"
        ? data.skills.split(",").map((s) => s.trim())
        : [];

    // =========================
    // ✅ CHECK EXISTING INSIGHT
    // =========================
    let industryInsight = await db.industryInsight.findUnique({
      where: { industry },
    });

    // =========================
    // ✅ AI CALL (SAFE)
    // =========================
    if (!industryInsight) {
      let topSkills = [];

      try {
        const completion = await openai.chat.completions.create({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Give top 5 skills for ${industry} in JSON format:
              { "skills": [] }`,
            },
          ],
        });

        const response = completion.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(response);

        topSkills = parsed.skills || [];
      } catch (err) {
        console.error("AI ERROR:", err);
        topSkills = ["JavaScript"]; // fallback
      }

      // =========================
      // ✅ CREATE INDUSTRY INSIGHT
      // =========================
      industryInsight = await db.industryInsight.create({
        data: {
          industry,
          salaryRanges: [],
          growthRate: 0,
          demandLevel: "Medium",
          topSkills: topSkills.length ? topSkills : ["JavaScript"],
          marketOutlook: "Neutral",
          keyTrends: [],
          recommendedSkills: [],
          nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // =========================
    // ✅ UPDATE USER
    // =========================
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        industry,
        experience,
        bio,
        skills,
      },
    });

    revalidatePath("/");

    return {
      success: true,
      user: updatedUser,
    };
  } catch (error) {
    console.error("FULL ERROR:", error);
    throw new Error("Failed to update profile");
  }
}

// ===============================
// ✅ GET ONBOARDING STATUS
// ===============================
export async function getUserOnboardingStatus() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
      select: {
        industry: true,
      },
    });

    return {
      isOnboarded: !!user?.industry,
    };
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    throw new Error("Failed to check onboarding status");
  }
}