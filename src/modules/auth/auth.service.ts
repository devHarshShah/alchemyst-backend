import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { FastifyInstance } from "fastify";
import { httpError } from "../../plugins/error-handler";

const SALT_ROUNDS = 10;

type AuthUser = {
  id: string;
  email: string;
};

export async function signup(
  fastify: FastifyInstance,
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await fastify.prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw httpError(409, "User already exists");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await fastify.prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
    },
    select: { id: true, email: true },
  });

  return {
    token: signToken(fastify, user),
    user,
  };
}

export async function login(
  fastify: FastifyInstance,
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await fastify.prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    throw httpError(401, "Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw httpError(401, "Invalid email or password");
  }

  return {
    token: signToken(fastify, { id: user.id, email: user.email }),
    user: { id: user.id, email: user.email },
  };
}

export function signToken(fastify: FastifyInstance, user: AuthUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    fastify.config.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
}
