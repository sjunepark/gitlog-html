package report

import (
	"crypto/rand"
	"encoding/base64"
	"time"
)

type Clock interface {
	Now() time.Time
}

type ClockFunc func() time.Time

func (f ClockFunc) Now() time.Time { return f() }

type NonceSource interface {
	Nonce() (string, error)
}

type NonceFunc func() (string, error)

func (f NonceFunc) Nonce() (string, error) { return f() }

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }

type CryptoNonce struct{}

func (source CryptoNonce) Nonce() (string, error) {
	const length = 18
	buffer := make([]byte, length)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}
