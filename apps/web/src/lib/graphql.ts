"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, getToken } from "./auth";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export class GraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphQLError";
  }
}

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new GraphQLError(`GraphQL request failed: ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors?.length) {
    throw new GraphQLError(
      payload.errors.map((error) => error.message).join("; "),
    );
  }
  if (!payload.data) throw new GraphQLError("GraphQL returned no data");
  return payload.data;
}

export interface GraphQLState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  enabled = true,
): GraphQLState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const serialised = JSON.stringify(variables ?? {});
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void gql<T>(query, JSON.parse(serialised) as Record<string, unknown>)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : "GraphQL request failed",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, serialised, enabled, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, refresh };
}

const OPPORTUNITY_FIELDS = `
  id
  title
  description
  companyId
  companyName
  companySlug
  companyWebsite
  country
  city
  workMode
  seniority
  employmentType
  salaryMin
  salaryMax
  currency
  applyUrl
  applicationMethod
  platform
  postedAt
  status
  skills
  riskScore
  riskAction
  match {
    opportunityId
    score
    explanation
    gaps
    factors { skills seniority location role freshness }
  }
`;

export const QUERIES = {
  opportunities: /* GraphQL */ `
    query Opportunities(
      $country: String
      $q: String
      $workMode: String
      $seniority: String
      $semantic: Boolean
      $limit: Int
    ) {
      opportunities(
        country: $country
        q: $q
        workMode: $workMode
        seniority: $seniority
        semantic: $semantic
        limit: $limit
      ) {
        ${OPPORTUNITY_FIELDS}
      }
    }
  `,
  opportunity: /* GraphQL */ `
    query Opportunity($id: ID!) {
      opportunity(id: $id) {
        ${OPPORTUNITY_FIELDS}
      }
    }
  `,
  matches: /* GraphQL */ `
    query Matches($limit: Int) {
      matches(limit: $limit) {
        ${OPPORTUNITY_FIELDS}
      }
    }
  `,
  profile: /* GraphQL */ `
    query Profile {
      profile {
        id
        email
        name
        fullName
        headline
        summary
        location
        country
        yearsExperience
        seniority
        skills
        desiredRoles
        preferredCountries
        preferredLocations
        remotePreferred
      }
    }
  `,
  applications: /* GraphQL */ `
    query Applications {
      applications {
        id
        status
        opportunityId
        createdAt
        updatedAt
        version
      }
    }
  `,
  followups: /* GraphQL */ `
    query FollowUps($status: String) {
      followups(status: $status) {
        id
        applicationId
        opportunityTitle
        companyName
        dueAt
        status
        channel
        note
        createdAt
      }
    }
  `,
  documents: /* GraphQL */ `
    query Documents($opportunityId: ID) {
      documents(opportunityId: $opportunityId) {
        id
        opportunityId
        type
        title
        content
        createdAt
      }
    }
  `,
  companies: /* GraphQL */ `
    query Companies($q: String, $limit: Int) {
      companies(q: $q, limit: $limit) {
        id
        name
        slug
        website
        careersUrl
        industry
        country
        openRoles
        newThisWeek
      }
    }
  `,
  professions: /* GraphQL */ `
    query Professions($depth: Int) {
      professions(depth: $depth) {
        id
        slug
        name
        depth
        domain
        aliases
        medianSalary
        currency
      }
    }
  `,
  aiStatus: /* GraphQL */ `
    query AiStatus {
      aiStatus {
        configured
        mode
      }
    }
  `,
};

export const MUTATIONS = {
  saveDocument: /* GraphQL */ `
    mutation SaveDocument($id: ID!, $title: String, $content: String) {
      saveDocument(id: $id, title: $title, content: $content) {
        id
        title
        content
        updatedAt
      }
    }
  `,
  updateProfile: /* GraphQL */ `
    mutation UpdateProfile($input: ProfileInput!) {
      updateProfile(input: $input) {
        id
        fullName
        headline
        summary
        location
        country
        yearsExperience
        seniority
        skills
        desiredRoles
      }
    }
  `,
  createApplication: /* GraphQL */ `
    mutation CreateApplication($opportunityId: ID!, $status: String) {
      createApplication(opportunityId: $opportunityId, status: $status) {
        id
        status
        opportunityId
        createdAt
        updatedAt
        version
      }
    }
  `,
};
